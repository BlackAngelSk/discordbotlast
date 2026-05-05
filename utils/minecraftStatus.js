const { fetch } = require('undici');
const dns = require('dns').promises;

const MINECRAFT_STATUS_TIMEOUT_MS = 5000;
const MCSTATUS_API_BASE = 'https://api.mcstatus.io/v2/status';

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
    normalizedHost = normalizedHost
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+|\.+$/g, '');

    let normalizedPort = portInput;
    const pastedAddressMatch = normalizedHost.match(/^([^\s:]+):(\d{1,5})$/);
    if (pastedAddressMatch && (normalizedPort === undefined || normalizedPort === null || normalizedPort === '')) {
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

const fetchMinecraftServerStatus = async (host, port) => {
    const normalizedInput = normalizeMinecraftStatusInput(host, port);
    if (normalizedInput.error) {
        throw new Error(normalizedInput.error);
    }

    const normalizedHost = normalizedInput.host;
    const normalizedPort = normalizedInput.port;

    const fetchJsonWithTimeout = async (url) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MINECRAFT_STATUS_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                headers: {
                    accept: 'application/json',
                    'user-agent': 'discordbot-dashboard/1.6.1'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Status lookup failed with HTTP ${response.status}.`);
            }

            return response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Minecraft status lookup timed out.');
            }

            throw error;
        } finally {
            clearTimeout(timeout);
        }
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
        port: Number.isInteger(payload?.port) ? payload.port : (normalizedPort || null),
        ip: payload?.ip || null,
        online: payload?.online === true,
        version: payload?.version || null,
        software: payload?.software || null,
        motd: toMotdText(payload?.motd?.clean),
        playersOnline: Number.isFinite(payload?.players?.online) ? payload.players.online : 0,
        playersMax: Number.isFinite(payload?.players?.max) ? payload.players.max : 0,
        playerNames: toPlayerNameList(payload?.players?.list, payload?.players?.sample)
    });

    const fromMcstatus = (payload, edition, requestedAddress) => ({
        requestedHost: normalizedHost,
        requestedPort: normalizedPort,
        hostname: payload?.host || normalizedHost,
        port: Number.isInteger(payload?.port) ? payload.port : (normalizedPort || null),
        ip: payload?.ip_address || payload?.srv_record?.target || null,
        online: payload?.online === true,
        version: payload?.version?.name_clean || payload?.version?.name_raw || null,
        software: payload?.software || edition,
        motd: toMotdText(payload?.motd?.clean),
        playersOnline: Number.isFinite(payload?.players?.online) ? payload.players.online : 0,
        playersMax: Number.isFinite(payload?.players?.max) ? payload.players.max : 0,
        playerNames: toPlayerNameList(payload?.players?.list, payload?.players?.sample),
        resolvedAddress: requestedAddress
    });

    const cleanSrvTarget = (value) => String(value || '').trim().replace(/\.+$/, '');

    const isLoopbackIp = (value) => {
        const ip = String(value || '').trim().toLowerCase();
        return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
    };

    const requestAddress = normalizedPort ? `${normalizedHost}:${normalizedPort}` : normalizedHost;
    let fallbackError = null;
    let primaryOfflineStatus = null;

    try {
        const mcsrvPayload = await fetchJsonWithTimeout(`https://api.mcsrvstat.us/3/${encodeURIComponent(requestAddress)}`);
        const status = fromMcsrvStatus(mcsrvPayload);
        if (status.online) {
            return status;
        }

        // mcsrvstat occasionally returns loopback placeholder data for custom DNS hosts.
        // Treat that as inconclusive so protocol-specific lookups can still decide status.
        if (!isLoopbackIp(status.ip)) {
            primaryOfflineStatus = status;
        }
    } catch (error) {
        fallbackError = error;
    }

    const protocolAttempts = [
        { edition: 'java', address: requestAddress },
        { edition: 'bedrock', address: port ? requestAddress : `${host}:19132` }
    ];

    let lastStatus = null;
    for (const attempt of protocolAttempts) {
        try {
            const payload = await fetchJsonWithTimeout(`${MCSTATUS_API_BASE}/${attempt.edition}/${encodeURIComponent(attempt.address)}`);
            const status = fromMcstatus(payload, attempt.edition, attempt.address);
            if (status.online) {
                return status;
            }

            lastStatus = status;
        } catch {
            // Keep trying other protocol variants.
        }
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

                const payload = await fetchJsonWithTimeout(`${MCSTATUS_API_BASE}/java/${encodeURIComponent(`${targetHost}:${targetPort}`)}`);
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

module.exports = {
    MINECRAFT_STATUS_TIMEOUT_MS,
    normalizeMinecraftStatusInput,
    fetchMinecraftServerStatus
};