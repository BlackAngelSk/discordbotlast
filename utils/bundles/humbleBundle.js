/**
 * Humble Bundle listing: which bundles are live right now and how long they
 * have left.
 *
 * Humble has no public API (the old /api/v1 endpoints are gone since the Ziff
 * Davis migration), so this reads the public bundle pages and pulls the
 * `bundlePage` object out of the React Server Components payload, which carries
 * the real `endDate` / `startDate` for each bundle.
 *
 * Note: humblebundle.com's robots.txt asks that automated clients not scrape.
 * This module therefore keeps the volume minimal — one request per category
 * page and one per bundle, cached for 30 min / 6 h respectively — and never
 * retries in a tight loop.
 */
'use strict';

const { EmbedBuilder } = require('discord.js');
const { httpsGetTextWithRetry, BROWSER_REQUEST_HEADERS } = require('../steam/steamUpdateUtils');

const BASE_URL = 'https://www.humblebundle.com';
const BUNDLE_TYPES = ['games', 'books', 'software'];
const TYPE_COLORS = { games: 0xcc2929, books: 0x1f6feb, software: 0x2ea043 };
const TYPE_LABELS = { games: 'Games', books: 'Books & Comics', software: 'Software' };
const DEFAULT_TYPE = 'games';

const REQUEST_TIMEOUT_MS = 25000;
const LISTING_TTL_MS = 30 * 60 * 1000;
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CONCURRENCY = 4;
// Even an explicit refresh waits this long, so a double-clicked button or two
// admins running the command at once cannot hammer humblebundle.com.
const MIN_FORCE_INTERVAL_MS = 60 * 1000;

const listingCache = new Map(); // type -> { at, slugs }
const detailCache = new Map(); // slug -> { at, page }

/**
 * React streams its payload as `self.__next_f.push([1,"..."])` chunks; joining
 * the strings reproduces the RSC document, which is where the bundle JSON lives.
 */
function decodeNextPayload(html) {
  const chunks = [];
  const pattern = /self\.__next_f\.push\((.*?)\)<\/script>/gs;
  let match;

  while ((match = pattern.exec(String(html || ''))) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
        chunks.push(parsed[1]);
      }
    } catch {
      // A malformed chunk should not abort the whole page.
    }
  }

  return chunks.join('');
}

/**
 * Parse the JSON object that starts at `startIndex` by matching braces while
 * respecting string literals and escapes.
 */
function parseJsonObjectAt(text, startIndex) {
  if (text[startIndex] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIndex, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/** Pull the `bundlePage` object (title, endDate, startDate, value…) from a page. */
function extractBundlePage(html) {
  const payload = decodeNextPayload(html);
  const marker = '"bundlePage":';
  const markerIndex = payload.indexOf(marker);

  if (markerIndex === -1) return null;

  return parseJsonObjectAt(payload, markerIndex + marker.length);
}

/** Bundle slugs linked from a category page (/games, /books, /software). */
function extractBundleSlugs(html, type = DEFAULT_TYPE) {
  const pattern = new RegExp(`href="/${type}/([a-z0-9-]+)"`, 'gi');
  const slugs = new Set();
  let match;

  while ((match = pattern.exec(String(html || ''))) !== null) {
    slugs.add(match[1].toLowerCase());
  }

  return [...slugs];
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** `▰▰▰▱▱▱▱▱` — how much of the sale window is left. */
function progressBar(fraction, segments = 8) {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;

  // Keep one segment lit while any time is left: a bundle in its last hours on a
  // two-week sale would otherwise round down to a fully empty bar.
  const filled = safe > 0 ? Math.max(1, Math.round(safe * segments)) : 0;

  return '█'.repeat(filled) + '░'.repeat(Math.max(0, segments - filled));
}

/**
 * Time left as a share of a one-week horizon, so the bar reads "how much longer
 * is this up" instead of shrinking to nothing on a long-running bundle.
 */
function timeFraction(bundle, horizonMs = 7 * 24 * 60 * 60 * 1000) {
  if (!bundle || typeof bundle.remainingMs !== 'number' || bundle.remainingMs <= 0) return 0;

  return Math.min(1, bundle.remainingMs / horizonMs);
}

/** Split a list into pages of `perPage` (always returns at least one page). */
function paginate(items, perPage = 5) {
  const size = Math.max(1, Math.floor(perPage));
  const list = Array.isArray(items) ? items : [];
  const pages = [];

  for (let index = 0; index < list.length; index += size) {
    pages.push(list.slice(index, index + size));
  }

  return pages.length > 0 ? pages : [[]];
}

/**
 * One embed field for a bundle: index, name, remaining-time bar, headline,
 * value and a link.
 */
function buildBundleCard(bundle, index, { soonMs = 24 * 60 * 60 * 1000 } = {}) {
  const endingSoon =
    typeof bundle.remainingMs === 'number' &&
    bundle.remainingMs > 0 &&
    bundle.remainingMs <= soonMs;

  const name = `${index + 1}. ${endingSoon ? '⏰ ' : ''}${truncate(bundle.title, 200)}`;
  const lines = [];

  if (bundle.endDate) {
    const unix = Math.floor(bundle.endDate.getTime() / 1000);
    lines.push(
      `${progressBar(timeFraction(bundle))} **${formatRemaining(bundle.remainingMs)}** left · ends <t:${unix}:d>`
    );
  } else {
    lines.push('████████ **No end date announced**');
  }

  if (bundle.headline) {
    lines.push(`*${truncate(bundle.headline, 140)}*`);
  }

  const meta = [];
  if (bundle.value) {
    meta.push(
      `💵 ${Number(bundle.value.amount).toLocaleString('en-US')} ${bundle.value.currency} worth`
    );
  }
  meta.push(`[Open bundle](${bundle.url})`);
  lines.push(meta.join(' · '));

  return { name, value: truncate(lines.join('\n'), 1024) };
}

/**
 * One embed for one bundle — used by the browse command (one embed per bundle)
 * and by the channel alerts.
 *
 * @param {object} bundle
 * @param {{ index?: number|null, titleOverride?: string|null, soonMs?: number }} [options]
 */
function buildBundleEmbed(
  bundle,
  { index = null, titleOverride = null, soonMs = 24 * 60 * 60 * 1000 } = {}
) {
  const endingSoon =
    typeof bundle.remainingMs === 'number' &&
    bundle.remainingMs > 0 &&
    bundle.remainingMs <= soonMs;

  const heading = `${index === null ? '' : `${index + 1}. `}${endingSoon ? '⏰' : '🎁'} ${bundle.title}`;

  const embed = new EmbedBuilder()
    .setColor(TYPE_COLORS[bundle.type] || TYPE_COLORS.games)
    .setTitle(truncate(titleOverride || heading, 256))
    .setURL(bundle.url)
    .setDescription(buildBundleCard(bundle, 0, { soonMs }).value)
    .setTimestamp();

  if (bundle.image) embed.setThumbnail(bundle.image);

  return embed;
}

function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'ended';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function normalizeBundle(page, type) {
  if (!page || !page.slug) return null;

  const endDate = page.endDate ? new Date(page.endDate) : null;
  const startDate = page.startDate ? new Date(page.startDate) : null;
  const validEnd = endDate && !Number.isNaN(endDate.getTime()) ? endDate : null;

  return {
    slug: page.slug,
    type: page.bundleType || type,
    title: page.title || page.slug,
    headline: page.headline || '',
    url: `${BASE_URL}/${type}/${page.slug}`,
    startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
    endDate: validEnd,
    remainingMs: validEnd ? validEnd.getTime() - Date.now() : null,
    ended: Boolean(validEnd && validEnd.getTime() <= Date.now()),
    value: page.value?.amount
      ? { amount: page.value.amount, currency: page.value.currencyCode || 'USD' }
      : null,
    image: page.thumbnailImageUrl || page.logoImageUrl || null,
  };
}

function sortBundles(bundles) {
  return bundles.slice().sort((left, right) => {
    if (left.ended !== right.ended) return left.ended ? 1 : -1;

    const leftEnd = left.endDate ? left.endDate.getTime() : Number.MAX_SAFE_INTEGER;
    const rightEnd = right.endDate ? right.endDate.getTime() : Number.MAX_SAFE_INTEGER;

    return leftEnd - rightEnd;
  });
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function fetchListing(type, { force = false } = {}) {
  const cached = listingCache.get(type);
  const age = cached ? Date.now() - cached.at : Infinity;
  const usableCache = Boolean(cached) && age < LISTING_TTL_MS;
  const forceAllowed = force && age >= MIN_FORCE_INTERVAL_MS;

  if (usableCache && !forceAllowed) {
    return { slugs: cached.slugs, cached: true };
  }

  const html = await httpsGetTextWithRetry(`${BASE_URL}/${type}`, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: BROWSER_REQUEST_HEADERS,
  });

  const slugs = extractBundleSlugs(html, type);
  listingCache.set(type, { at: Date.now(), slugs });

  return { slugs, cached: false };
}

async function fetchDetail(slug, type, { force = false } = {}) {
  const cached = detailCache.get(slug);
  const age = cached ? Date.now() - cached.at : Infinity;
  const usableCache = Boolean(cached) && age < DETAIL_TTL_MS;
  const forceAllowed = force && age >= MIN_FORCE_INTERVAL_MS;

  if (usableCache && !forceAllowed) {
    return cached.page;
  }

  const html = await httpsGetTextWithRetry(`${BASE_URL}/${type}/${slug}`, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: BROWSER_REQUEST_HEADERS,
  });

  const page = extractBundlePage(html);
  if (!page) {
    throw new Error('bundle details missing from page');
  }

  detailCache.set(slug, { at: Date.now(), page });
  return page;
}

/**
 * Current Humble bundles with their remaining time.
 *
 * @param {{ types?: string[], force?: boolean, includeEnded?: boolean }} [options]
 * @returns {Promise<{ bundles: object[], fetchedAt: string, failed: string[], types: string[] }>}
 */
async function getHumbleBundles({
  types = [DEFAULT_TYPE],
  force = false,
  includeEnded = false,
} = {}) {
  const requested = (Array.isArray(types) ? types : [types])
    .map((type) => String(type || '').toLowerCase())
    .filter((type) => BUNDLE_TYPES.includes(type));

  const activeTypes = requested.length > 0 ? [...new Set(requested)] : [DEFAULT_TYPE];
  const failed = [];
  const targets = [];

  for (const type of activeTypes) {
    try {
      const { slugs } = await fetchListing(type, { force });
      for (const slug of slugs) {
        targets.push({ slug, type });
      }
    } catch (error) {
      failed.push(`${type}: ${error.message || error}`);
    }
  }

  if (targets.length === 0 && failed.length === activeTypes.length) {
    throw new Error(`Could not load Humble Bundle listings (${failed.join('; ')})`);
  }

  const bundles = await mapWithConcurrency(targets, MAX_CONCURRENCY, async ({ slug, type }) => {
    try {
      const page = await fetchDetail(slug, type, { force });
      return normalizeBundle(page, type);
    } catch (error) {
      failed.push(`${slug}: ${error.message || error}`);
      return null;
    }
  });

  const usable = bundles.filter(Boolean).filter((bundle) => includeEnded || !bundle.ended);

  return {
    bundles: sortBundles(usable),
    fetchedAt: new Date().toISOString(),
    failed,
    types: activeTypes,
  };
}

/**
 * Fit bundle cards into one Discord embed: respects the 25-field cap and the
 * ~6000-character embed limit, returning how many were left out.
 *
 * @param {object[]} items
 * @param {{ maxFields?: number, charBudget?: number, baseChars?: number, format: (item: object) => { name: string, value: string } }} options
 */
function fitFields(items, { maxFields = 24, charBudget = 4700, baseChars = 0, format } = {}) {
  const fields = [];
  let used = baseChars;

  for (const item of items) {
    if (fields.length >= maxFields) break;

    const field = format(item);
    const cost = String(field.name).length + String(field.value).length;

    if (used + cost > charBudget) break;

    used += cost;
    fields.push(field);
  }

  return { fields, remaining: items.length - fields.length };
}

function clearHumbleCache() {
  listingCache.clear();
  detailCache.clear();
}

module.exports = {
  BUNDLE_TYPES,
  DEFAULT_TYPE,
  decodeNextPayload,
  parseJsonObjectAt,
  extractBundlePage,
  extractBundleSlugs,
  formatRemaining,
  progressBar,
  timeFraction,
  paginate,
  buildBundleCard,
  buildBundleEmbed,
  TYPE_COLORS,
  TYPE_LABELS,
  truncate,
  normalizeBundle,
  sortBundles,
  getHumbleBundles,
  MIN_FORCE_INTERVAL_MS,
  fitFields,
  clearHumbleCache,
};
