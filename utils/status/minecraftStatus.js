const { fetch } = require('undici');
const dns = require('dns').promises;

const MINECRAFT_STATUS_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.MINECRAFT_STATUS_TIMEOUT_MS) || 8000
);
const MINECRAFT_STATUS_ATTEMPTS = Math.max(
  1,
  Math.min(4, Number(process.env.MINECRAFT_STATUS_ATTEMPTS) || 2)
);
const MINECRAFT_STATUS_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.MINECRAFT_STATUS_CACHE_TTL_MS) || 15000
);
const MCSTATUS_API_BASE = 'https://api.mcstatus.io/v2/status';

// Short-lived cache: the dashboard, the monitor tick and manual refreshes all ask
// for the same server within seconds of each other.
const statusCache = new Map();

const clearMinecraftStatusCache = () => statusCache.clear();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutError = (error) =>
  error?.name === 'AbortError' ||
  error?.name === 'TimeoutError' ||
  error?.code === 'ABORT_ERR' ||
  /timed out/i.test(String(error?.message || ''));

const normalizeMinecraftStatusInput = (hostInput, portInput) => {
  const rawHost = String(hostInput || '').trim();
  if (!rawHost) {
    return { error: 'Minecraft server address is required.' };
  }

  let normalizedHost = rawHost
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  // Accept pasted vanity hosts that include accidental repeated dots.
  normalizedHost = normalizedHost.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');

  let normalizedPort = portInput;
  const pastedAddressMatch = normalizedHost.match(/^([^\s:]+):(\d{1,5})$/);
  if (
    pastedAddressMatch &&
    (normalizedPort === undefined || normalizedPort === null || normalizedPort === '')
  ) {
    normalizedHost = pastedAddressMatch[1];
    normalizedPort = pastedAddressMatch[2];
  }

  normalizedHost = normalizedHost.toLowerCase();

  if (!normalizedHost || normalizedHost.length > 253 || !/^[a-z0-9.-]+$/i.test(normalizedHost)) {
    return { error: 'Use a valid Minecraft host name or IPv4 address.' };
  }

  let port = null;
  if (normalizedPort !== undefined && normalizedPort !== null && normalizedPort !== '') {
    const parsedPort = Number(normalizedPort);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { error: 'Port must be a whole number between 1 and 65535.' };
    }

    port = parsedPort;
  }

  return { host: normalizedHost, port };
};

const lookupMinecraftServerStatus = async (host, port) => {
  const normalizedInput = normalizeMinecraftStatusInput(host, port);
  if (normalizedInput.error) {
    throw new Error(normalizedInput.error);
  }

  const normalizedHost = normalizedInput.host;
  const normalizedPort = normalizedInput.port;

  const fetchJsonWithTimeout = async (
    url,
    { timeoutMs = MINECRAFT_STATUS_TIMEOUT_MS, attempts = MINECRAFT_STATUS_ATTEMPTS } = {}
  ) => {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          headers: {
            accept: 'application/json',
            'user-agent': 'discordbot-dashboard/1.6.1',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Status lookup failed with HTTP ${response.status}.`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        const isTimeout = isTimeoutError(error);
        // Only retry timeouts — an HTTP 4xx/5xx will not get better instantly.
        if (!isTimeout || attempt >= attempts) break;

        await delay(250 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (isTimeoutError(lastError)) {
      throw new Error('Minecraft status lookup timed out.', { cause: lastError });
    }

    throw lastError || new Error('Minecraft status lookup failed.');
  };

  const toMotdText = (motdValue) => {
    if (Array.isArray(motdValue)) {
      return motdValue.filter(Boolean).join(' ').trim() || null;
    }

    if (typeof motdValue === 'string' && motdValue.trim()) {
      return motdValue.trim();
    }

    return null;
  };

  const toPlayerNameList = (...sources) => {
    const names = [];

    for (const source of sources) {
      if (!Array.isArray(source)) continue;

      for (const entry of source) {
        if (typeof entry === 'string') {
          const cleaned = entry.trim();
          if (cleaned) {
            names.push(cleaned);
          }
          continue;
        }

        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const rawName = entry.name_clean || entry.name_raw || entry.name || entry.username || '';
        const cleaned = String(rawName).trim();
        if (cleaned) {
          names.push(cleaned);
        }
      }
    }

    const unique = [];
    const seen = new Set();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(name);
    }

    return unique;
  };

  const fromMcsrvStatus = (payload) => ({
    requestedHost: normalizedHost,
    requestedPort: normalizedPort,
    hostname: payload?.hostname || normalizedHost,
    port: Number.isInteger(payload?.port) ? payload.port : normalizedPort || null,
    ip: payload?.ip || null,
    online: payload?.online === true,
    version: payload?.version || null,
    software: payload?.software || null,
    motd: toMotdText(payload?.motd?.clean),
    playersOnline: Number.isFinite(payload?.players?.online) ? payload.players.online : 0,
    playersMax: Number.isFinite(payload?.players?.max) ? payload.players.max : 0,
    playerNames: toPlayerNameList(payload?.players?.list, payload?.players?.sample),
  });

  const fromMcstatus = (payload, edition, requestedAddress) => ({
    requestedHost: normalizedHost,
    requestedPort: normalizedPort,
    hostname: payload?.host || normalizedHost,
    port: Number.isInteger(payload?.port) ? payload.port : normalizedPort || null,
    ip: payload?.ip_address || payload?.srv_record?.target || null,
    online: payload?.online === true,
    version: payload?.version?.name_clean || payload?.version?.name_raw || null,
    software: payload?.software || edition,
    motd: toMotdText(payload?.motd?.clean),
    playersOnline: Number.isFinite(payload?.players?.online) ? payload.players.online : 0,
    playersMax: Number.isFinite(payload?.players?.max) ? payload.players.max : 0,
    playerNames: toPlayerNameList(payload?.players?.list, payload?.players?.sample),
    resolvedAddress: requestedAddress,
  });

  const cleanSrvTarget = (value) =>
    String(value || '')
      .trim()
      .replace(/\.+$/, '');

  const isLoopbackIp = (value) => {
    const ip = String(value || '')
      .trim()
      .toLowerCase();
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
  };

  const requestAddress = normalizedPort ? `${normalizedHost}:${normalizedPort}` : normalizedHost;
  let fallbackError = null;
  let primaryOfflineStatus = null;
  let lastStatus = null;

  // Run the two primary API lookups in parallel. As soon as one confirms the
  // server is online we return it — no waiting for the other API to time out.
  const primaryLookups = [
    {
      label: 'mcsrvstat',
      run: async () => {
        const payload = await fetchJsonWithTimeout(
          `https://api.mcsrvstat.us/3/${encodeURIComponent(requestAddress)}`
        );
        return fromMcsrvStatus(payload);
      },
    },
    {
      label: 'mcstatus-java',
      run: async () => {
        const payload = await fetchJsonWithTimeout(
          `${MCSTATUS_API_BASE}/java/${encodeURIComponent(requestAddress)}`
        );
        return fromMcstatus(payload, 'java', requestAddress);
      },
    },
  ];

  const settledLookups = primaryLookups.map((lookup, index) =>
    lookup.run().then(
      (status) => ({ index, status }),
      (error) => ({ index, error })
    )
  );

  const firstOnline = await Promise.race([
    ...settledLookups.map((promise) =>
      promise.then((entry) => (entry.status?.online ? entry : new Promise(() => {})))
    ),
    // Nothing came back online — resolve with null once every lookup settled.
    Promise.all(settledLookups).then(() => null),
  ]);

  if (firstOnline) {
    return firstOnline.status;
  }

  const primaryResults = await Promise.all(settledLookups);

  for (const result of primaryResults) {
    if (result.status) {
      const status = result.status;

      if (result.index === 0) {
        // mcsrvstat: loopback IPs are inconclusive, skip storing as primary offline.
        if (!isLoopbackIp(status.ip)) {
          primaryOfflineStatus = status;
        }
      } else if (!lastStatus) {
        lastStatus = status;
      }
    } else if (!fallbackError) {
      fallbackError = result.error;
    }
  }

  // Bedrock fallback (sequential, secondary).
  try {
    const bedrockAddress = port ? requestAddress : `${host}:19132`;
    const payload = await fetchJsonWithTimeout(
      `${MCSTATUS_API_BASE}/bedrock/${encodeURIComponent(bedrockAddress)}`,
      // Secondary source: don't spend the full retry budget on it.
      { timeoutMs: Math.min(MINECRAFT_STATUS_TIMEOUT_MS, 5000), attempts: 1 }
    );
    const status = fromMcstatus(payload, 'bedrock', bedrockAddress);
    if (status.online) {
      return status;
    }

    if (!lastStatus) {
      lastStatus = status;
    }
  } catch {
    // Keep trying other fallbacks.
  }

  // SRV fallback for java hosts behind vanity domains.
  if (!normalizedPort) {
    try {
      const srvRecords = await dns.resolveSrv(`_minecraft._tcp.${normalizedHost}`);
      for (const record of srvRecords || []) {
        const targetHost = cleanSrvTarget(record?.name);
        const targetPort = Number(record?.port);
        if (!targetHost || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
          continue;
        }

        const payload = await fetchJsonWithTimeout(
          `${MCSTATUS_API_BASE}/java/${encodeURIComponent(`${targetHost}:${targetPort}`)}`,
          { timeoutMs: Math.min(MINECRAFT_STATUS_TIMEOUT_MS, 5000), attempts: 1 }
        );
        const status = fromMcstatus(payload, 'java', `${targetHost}:${targetPort}`);
        if (status.online) {
          return status;
        }

        if (!lastStatus) {
          lastStatus = status;
        }
      }
    } catch {
      // No SRV record or lookup failure; continue with collected fallbacks.
    }
  }

  if (lastStatus) {
    return lastStatus;
  }

  if (primaryOfflineStatus) {
    return primaryOfflineStatus;
  }

  if (fallbackError) {
    throw fallbackError;
  }

  throw new Error('Minecraft status lookup failed.');
};

/**
 * Cached lookup. Successful *and* offline results are cached for a few seconds so
 * the dashboard, the monitor and manual refreshes don't hammer the status APIs.
 * Errors are never cached.
 */
const fetchMinecraftServerStatus = async (host, port) => {
  const cacheKey = `${String(host || '')
    .trim()
    .toLowerCase()}|${port ?? ''}`;
  const cached = statusCache.get(cacheKey);

  if (
    cached &&
    MINECRAFT_STATUS_CACHE_TTL_MS > 0 &&
    Date.now() - cached.at < MINECRAFT_STATUS_CACHE_TTL_MS
  ) {
    return cached.status;
  }

  const status = await lookupMinecraftServerStatus(host, port);

  statusCache.set(cacheKey, { at: Date.now(), status });
  if (statusCache.size > 500) {
    // Drop the oldest entry; the map is tiny and only holds live servers.
    const oldestKey = statusCache.keys().next().value;
    if (oldestKey !== undefined) statusCache.delete(oldestKey);
  }

  return status;
};

module.exports = {
  MINECRAFT_STATUS_ATTEMPTS,
  MINECRAFT_STATUS_CACHE_TTL_MS,
  MINECRAFT_STATUS_TIMEOUT_MS,
  clearMinecraftStatusCache,
  fetchMinecraftServerStatus,
  normalizeMinecraftStatusInput,
};
