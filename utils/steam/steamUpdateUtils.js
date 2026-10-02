/**
 * Steam update fetching + text/HTML parsing utilities.
 *
 * Extracted from steamGameUpdatesManager.js (Phase 4). These are pure,
 * stateless helpers — no manager state, no Discord objects.
 */

const https = require('https');
const { toEpochMs } = require('../core/helpers.mjs');

const REQUEST_TIMEOUT = 20000;
const FETCH_RETRY_ATTEMPTS = 2;
const FETCH_RETRY_DELAY_MS = 2000;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com)',
};

function httpsGet(
  url,
  { responseType = 'json', headers = {}, redirectCount = 0, timeout = REQUEST_TIMEOUT } = {}
) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        timeout,
        headers: { ...REQUEST_HEADERS, ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectCount >= 5) {
              return reject(new Error('Too many redirects'));
            }

            const nextUrl = new URL(res.headers.location, url).toString();
            return resolve(
              httpsGet(nextUrl, {
                responseType,
                headers,
                timeout,
                redirectCount: redirectCount + 1,
              })
            );
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          if (responseType === 'text') {
            return resolve(data);
          }

          try {
            // Preserve large integer fields (e.g. Steam gid) that exceed JS safe integer range
            const safeData = data.replace(/"gid"\s*:\s*(\d{10,})/g, '"gid":"$1"');
            resolve(JSON.parse(safeData));
          } catch {
            reject(new Error('Invalid JSON response from remote API'));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('API request timed out'));
    });
  });
}

function httpsGetJson(url, options) {
  return httpsGet(url, { ...options, responseType: 'json' });
}

function httpsGetText(url, options) {
  return httpsGet(url, { ...options, responseType: 'text' });
}

/**
 * Fetch text with retry on transient errors (timeout, ECONNRESET, etc.).
 */
async function httpsGetTextWithRetry(url, options, attempts = FETCH_RETRY_ATTEMPTS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await httpsGetText(url, options);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '').toLowerCase();
      const isTransient =
        /timeout|timed out|econnreset|socket hang up|etimedout|enotfound|http\s+5\d{2}/i.test(
          message
        );
      if (attempt >= attempts || !isTransient) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\/?[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  let result = String(value || '');
  const AMP = String.fromCharCode(38);
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const entities = [
    [`${AMP}nbsp;`, ' '],
    [`${AMP}amp;`, AMP],
    [`${AMP}quot;`, String.fromCharCode(34)],
    [`${AMP}#39;`, String.fromCharCode(39)],
    [`${AMP}apos;`, String.fromCharCode(39)],
    [`${AMP}lt;`, LT],
    [`${AMP}gt;`, GT],
  ];
  for (const [entity, char] of entities) {
    result = result.split(entity).join(char);
  }
  return result;
}

function sanitizeText(value) {
  return decodeEntities(stripHtml(value));
}

function truncate(value, maxLength) {
  const safeValue = String(value || '').trim();
  if (!safeValue || safeValue.length <= maxLength) return safeValue;
  return `${safeValue.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildSteamClanImageUrl(clanId, imagePath) {
  const safeClanId = String(clanId || '').trim();
  const safeImagePath = String(imagePath || '')
    .trim()
    .replace(/^\/+/, '');
  if (!safeClanId || !safeImagePath) return null;

  return `https://clan.akamai.steamstatic.com/images/${safeClanId}/${safeImagePath}`;
}

function extractSteamClanImageUrl(contents) {
  const raw = String(contents || '');
  if (!raw) return null;

  const placeholderMatch = raw.match(
    /\{STEAM_CLAN_IMAGE\}\/([0-9]+)\/([^\s\]"']+\.(?:jpg|jpeg|png|gif|webp))/i
  );
  if (placeholderMatch?.[1] && placeholderMatch?.[2]) {
    return buildSteamClanImageUrl(placeholderMatch[1], placeholderMatch[2]);
  }

  const absoluteMatch = raw.match(
    /https?:\/\/clan\.akamai\.steamstatic\.com\/images\/([0-9]+)\/([^\s\]"']+\.(?:jpg|jpeg|png|gif|webp))/i
  );
  if (absoluteMatch?.[1] && absoluteMatch?.[2]) {
    return buildSteamClanImageUrl(absoluteMatch[1], absoluteMatch[2]);
  }

  return null;
}

function removeSteamImageMarkup(contents) {
  const raw = String(contents || '');
  if (!raw) return '';

  return raw
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\{STEAM_CLAN_IMAGE\}\/[0-9]+\/[^\s\]"']+\.(?:jpg|jpeg|png|gif|webp)/gi, ' ')
    .replace(
      /https?:\/\/clan\.akamai\.steamstatic\.com\/images\/[0-9]+\/[^\s\]"']+\.(?:jpg|jpeg|png|gif|webp)/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function formatChangelogSummary(article) {
  if (!article) return '';

  // Format sections if available (Steam format)
  if (Array.isArray(article.sections) && article.sections.length > 0) {
    const sectionLines = [];
    for (const section of article.sections.slice(0, 3)) {
      const title = String(section.title || 'Updates')
        .trim()
        .toUpperCase();
      sectionLines.push(`[ ${title} ]`);

      const items = Array.isArray(section.items) ? section.items : [];
      for (const item of items.slice(0, 4)) {
        const cleanItem = truncate(sanitizeText(item), 180);
        if (cleanItem) sectionLines.push(`• ${cleanItem}`);
      }
      sectionLines.push('');
    }
    return truncate(sectionLines.join('\n'), 400);
  }

  // Use summary if available (Minecraft, League, osu format)
  if (article.summary) {
    return truncate(sanitizeText(article.summary), 400);
  }

  // Fallback to contents (raw Steam format)
  if (article.contents) {
    const cleaned = sanitizeText(article.contents);
    return truncate(cleaned, 400);
  }

  return '';
}

function toUnixTimestamp(value) {
  const timestamp =
    typeof value === 'number' ? value : Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildProviderUpdateKey(provider, { id, url, title, date } = {}) {
  const normalizedProvider = String(provider || 'provider')
    .trim()
    .toLowerCase();
  const normalizedId = String(id || '')
    .trim()
    .toLowerCase();
  const normalizedUrl = String(url || '')
    .trim()
    .toLowerCase();
  const normalizedTitle = truncate(sanitizeText(title || 'update').toLowerCase(), 120);
  const dateMs = toEpochMs(date, 0);

  const parts = [normalizedProvider, normalizedId, normalizedUrl, normalizedTitle];
  if (dateMs > 0) parts.push(String(dateMs));

  return parts.filter(Boolean).join(':');
}

function parseUsDateToIso(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString();
}

module.exports = {
  httpsGet,
  httpsGetJson,
  httpsGetText,
  httpsGetTextWithRetry,
  stripHtml,
  decodeEntities,
  sanitizeText,
  truncate,
  buildSteamClanImageUrl,
  extractSteamClanImageUrl,
  removeSteamImageMarkup,
  formatChangelogSummary,
  toUnixTimestamp,
  buildProviderUpdateKey,
  parseUsDateToIso,
};