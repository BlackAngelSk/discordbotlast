/**
 * Steam store sale ("what is on sale right now") fetching + parsing helpers.
 *
 * The promo alerts used to only look for limited-time *free* play events, which
 * almost never happen. This module powers a real discounted-games feed:
 *
 *   - store search with `specials=1` (thousands of discounted apps, prices in
 *     the region currency, review scores)
 *   - `api/featuredcategories` specials (front-page daily/weekly deals)
 *
 * Everything except the two `fetch*` helpers is pure and unit-testable.
 */
// @ts-check

'use strict';

const DEFAULT_REGION = String(process.env.STEAM_STORE_CC || 'sk').toLowerCase();
const REQUEST_TIMEOUT_MS = 20000;
const SEARCH_URL = 'https://store.steampowered.com/search/results/';
const FEATURED_URL = 'https://store.steampowered.com/api/featuredcategories';
const CHEAPSHARK_URL = 'https://www.cheapshark.com/api/1.0/deals';
const STEAM_STORE_HOST = 'store.steampowered.com';
// Steam's Akamai edge returns "Access Denied" (403) for the search/featured
// endpoints when it thinks we are scraping too hard. Back off instead of hammering.
const STEAM_BLOCK_COOLDOWN_MS = 10 * 60 * 1000;
const STEAM_BLOCK_THRESHOLD = 2;
const CHEAPSHARK_PAGE_DELAY_MS = 900;

let steamBlockStreak = 0;
let steamBlockedUntil = 0;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BRL: 'R$',
  RUB: '₽',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  TRY: '₺',
  UAH: '₴',
  INR: '₹',
  CNY: '¥',
};

/** Defaults used when a guild has no explicit deal settings yet. */
const DEFAULT_DEAL_SETTINGS = Object.freeze({
  salesEnabled: true,
  minDiscountPercent: 50,
  minReviewCount: 100,
  minReviewPercent: 70,
  maxDealsPerMessage: 8,
  dealPostIntervalHours: 3,
});

const REVIEW_CLASS_LABELS = {
  overwhelmingly_positive: 'Overwhelmingly Positive',
  very_positive: 'Very Positive',
  positive: 'Positive',
  mostly_positive: 'Mostly Positive',
  mixed: 'Mixed',
  mostly_negative: 'Mostly Negative',
  negative: 'Negative',
  very_negative: 'Very Negative',
  overwhelmingly_negative: 'Overwhelmingly Negative',
};

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function clampInt(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function toIsoFromUnixSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatCents(cents, currency) {
  const numeric = Number(cents);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const code = String(currency || 'EUR').toUpperCase();
  const amount = (numeric / 100).toFixed(2);
  const symbol = CURRENCY_SYMBOLS[code];

  if (symbol === '€') return `${amount.replace('.', ',')}€`;
  if (symbol === '$') return `$${amount}`;
  if (symbol === '£') return `£${amount}`;
  if (symbol) return `${amount} ${symbol}`;
  return `${amount} ${code}`;
}

function steamHeaderImageUrl(appId) {
  const normalized = String(appId || '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${normalized}/header.jpg`;
}

function reviewLabelFromClass(className) {
  const key = String(className || '')
    .trim()
    .toLowerCase();
  return REVIEW_CLASS_LABELS[key] || null;
}

/** Split a Steam search page into per-result chunks (`<a ... data-ds-appid=...>`). */
function splitSearchResultRows(html) {
  const source = String(html || '');
  if (!source) return [];

  const chunks = source.split(/(?=<a\s+href="https:\/\/store\.steampowered\.com\/app\/)/i);
  return chunks.filter((chunk) => /data-ds-appid="\d+"/i.test(chunk));
}

/**
 * Parse one store-search result row into a deal. Returns null for rows without a
 * usable discount (bundles use `data-ds-bundleid` and are skipped by design).
 *
 * @param {string} row
 * @param {{ region?: string }} [options]
 */
function parseSearchDealRow(row, { region = DEFAULT_REGION } = {}) {
  const chunk = String(row || '');
  if (!chunk) return null;

  const appId = (chunk.match(/data-ds-appid="(\d+)"/i) || [])[1];
  if (!appId) return null;

  const discountMatch =
    chunk.match(/data-discount="(\d{1,3})"/i) || chunk.match(/discount_pct[^>]*>\s*-(\d{1,3})%/i);
  const discountPercent = Number(discountMatch?.[1] || 0);
  if (!Number.isFinite(discountPercent) || discountPercent <= 0) return null;

  const title = cleanText((chunk.match(/<span class="title">([\s\S]*?)<\/span>/i) || [])[1]);
  if (!title) return null;

  const priceOriginal = cleanText(
    (chunk.match(/discount_original_price">([\s\S]*?)<\/div>/i) || [])[1]
  );
  const priceFinal = cleanText((chunk.match(/discount_final_price">([\s\S]*?)<\/div>/i) || [])[1]);
  const finalPriceCents = Number((chunk.match(/data-price-final="(\d+)"/i) || [])[1] || 0);

  const reviewTooltip =
    (chunk.match(/search_review_summary[^>]*data-tooltip-html="([^"]*)"/i) || [])[1] || '';
  const reviewStats = decodeHtmlEntities(reviewTooltip).match(
    /(\d{1,3})%\s+of\s+the\s+([\d,.]+)\s+user\s+reviews/i
  );
  const reviewClass = (chunk.match(/search_review_summary\s+([a-z_]+)/i) || [])[1] || null;

  const capsuleUrl = (chunk.match(/<div class="search_capsule">\s*<img\s+src="([^"]+)"/i) || [])[1];

  return {
    appId: String(appId),
    id: `deal_${appId}`,
    title,
    discountPercent,
    priceOriginal: priceOriginal || null,
    priceFinal: priceFinal || null,
    finalPriceCents: Number.isFinite(finalPriceCents) ? finalPriceCents : null,
    currency: null,
    reviewSummary: reviewLabelFromClass(reviewClass),
    reviewPercent: reviewStats ? Number(reviewStats[1]) : null,
    reviewCount: reviewStats ? Number(String(reviewStats[2]).replace(/[,.]/g, '')) : 0,
    releaseDate: cleanText((chunk.match(/search_released[^>]*>([\s\S]*?)<\/div>/i) || [])[1]),
    url: `https://store.steampowered.com/app/${appId}/`,
    imageUrl: steamHeaderImageUrl(appId) || capsuleUrl || null,
    capsuleUrl: capsuleUrl || null,
    endsAt: null,
    region,
    source: 'steam_search',
  };
}

/**
 * Parse a full Steam store search HTML page (as returned by the `infinite=1`
 * JSON payload) into deals.
 *
 * @param {string} html
 * @param {{ region?: string }} [options]
 */
function parseSearchDealRows(html, options = {}) {
  return splitSearchResultRows(html)
    .map((row) => parseSearchDealRow(row, options))
    .filter(Boolean);
}

/**
 * Normalize one `api/featuredcategories` specials entry.
 *
 * @param {any} item
 * @param {{ region?: string }} [options]
 */
function parseFeaturedDeal(item, { region = DEFAULT_REGION } = {}) {
  if (!item || typeof item !== 'object') return null;

  const appId = String(item.id || '').trim();
  if (!/^\d+$/.test(appId)) return null;

  const discountPercent = Number(item.discount_percent || 0);
  if (!Number.isFinite(discountPercent) || discountPercent <= 0) return null;

  const title = cleanText(item.name);
  if (!title) return null;

  const currency = String(item.currency || '').toUpperCase() || null;

  return {
    appId,
    id: `deal_${appId}`,
    title,
    discountPercent,
    priceOriginal: formatCents(item.original_price, currency),
    priceFinal: formatCents(item.final_price, currency),
    finalPriceCents: Number.isFinite(Number(item.final_price)) ? Number(item.final_price) : null,
    currency,
    reviewSummary: null,
    reviewPercent: null,
    reviewCount: 0,
    releaseDate: null,
    url: `https://store.steampowered.com/app/${appId}/`,
    imageUrl: item.header_image || item.large_capsule_image || steamHeaderImageUrl(appId),
    capsuleUrl: item.small_capsule_image || null,
    endsAt: toIsoFromUnixSeconds(item.discount_expiration),
    region,
    source: 'steam_featured',
  };
}

/**
 * @param {any} payload `featuredcategories` JSON payload
 * @param {{ region?: string }} [options]
 */
function parseFeaturedDeals(payload, options = {}) {
  const items = Array.isArray(payload?.specials?.items) ? payload.specials.items : [];
  return items.map((item) => parseFeaturedDeal(item, options)).filter(Boolean);
}

/**
 * Keep the best (highest discount) entry per appId across all sources.
 *
 * @param {Array<any>} lists
 */
function mergeDealLists(...lists) {
  /** @type {Map<string, any>} */
  const byAppId = new Map();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;

    for (const deal of list) {
      const appId = String(deal?.appId || '').trim();
      if (!appId || !Number.isFinite(Number(deal?.discountPercent))) continue;

      const existing = byAppId.get(appId);
      if (!existing) {
        byAppId.set(appId, deal);
        continue;
      }

      const isBetterDiscount = deal.discountPercent > existing.discountPercent;
      const isSameDiscountButRicher =
        deal.discountPercent === existing.discountPercent &&
        (!existing.reviewCount || !existing.priceOriginal) &&
        Boolean(deal.reviewCount || deal.priceOriginal);

      if (isBetterDiscount || isSameDiscountButRicher) {
        byAppId.set(appId, {
          ...existing,
          ...deal,
          reviewCount: deal.reviewCount || existing.reviewCount || 0,
          reviewPercent: deal.reviewPercent ?? existing.reviewPercent ?? null,
          reviewSummary: deal.reviewSummary || existing.reviewSummary || null,
          endsAt: deal.endsAt || existing.endsAt || null,
          imageUrl: deal.imageUrl || existing.imageUrl || null,
        });
      }
    }
  }

  return [...byAppId.values()];
}

/** Buzz score: deep discounts with many reviews rank first. */
function scoreDeal(deal) {
  const discount = Number(deal?.discountPercent || 0);
  const reviews = Math.max(1, Number(deal?.reviewCount || 0));
  return discount + Math.log10(reviews) * 6;
}

/**
 * Filter + rank deals for a guild's settings.
 *
 * @param {Array<any>} deals
 * @param {any} [settings]
 */
function selectDeals(deals, settings = {}) {
  const minDiscountPercent = clampInt(
    settings.minDiscountPercent,
    1,
    100,
    DEFAULT_DEAL_SETTINGS.minDiscountPercent
  );
  const minReviewCount = clampInt(
    settings.minReviewCount,
    0,
    1000000,
    DEFAULT_DEAL_SETTINGS.minReviewCount
  );
  const minReviewPercent = clampInt(
    settings.minReviewPercent,
    0,
    100,
    DEFAULT_DEAL_SETTINGS.minReviewPercent
  );
  const limit = clampInt(settings.limit, 1, 500, 20);

  return (Array.isArray(deals) ? deals : [])
    .filter((deal) => Number(deal?.discountPercent || 0) >= minDiscountPercent)
    .filter((deal) => Number(deal?.reviewCount || 0) >= minReviewCount)
    .filter((deal) => {
      const percent = Number(deal?.reviewPercent);
      return !Number.isFinite(percent) || percent >= minReviewPercent;
    })
    .map((deal) => ({ ...deal, score: scoreDeal(deal) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.discountPercent - left.discountPercent ||
        String(left.title).localeCompare(String(right.title))
    )
    .slice(0, limit);
}

function noteSteamBlock() {
  steamBlockStreak += 1;
  if (steamBlockStreak >= STEAM_BLOCK_THRESHOLD) {
    steamBlockedUntil = Date.now() + STEAM_BLOCK_COOLDOWN_MS;
    steamBlockStreak = 0;
  }
}

function noteSteamSuccess() {
  steamBlockStreak = 0;
}

/** True while Steam's store edge is rate-limiting us. */
function isSteamStoreCoolingDown(now = Date.now()) {
  return now < steamBlockedUntil;
}

function cooldownRemainingMs(now = Date.now()) {
  return Math.max(0, steamBlockedUntil - now);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestText(url, { timeoutMs = REQUEST_TIMEOUT_MS, retries = 1 } = {}) {
  const isSteamStore = String(url).includes(STEAM_STORE_HOST);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/html, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const body = await response.text();
        if (isSteamStore) noteSteamSuccess();
        return body;
      }

      const error = new Error(`HTTP ${response.status} for ${url}`);
      error.status = response.status;

      // 403/429 from the Steam store = anti-bot edge; retrying immediately makes it worse.
      if (isSteamStore && (response.status === 403 || response.status === 429)) {
        noteSteamBlock();
        throw error;
      }

      lastError = error;
    } catch (error) {
      lastError = error;
      if (error.status === 403 || error.status === 429) break;
    }

    if (attempt < retries) await sleep(600 * (attempt + 1));
  }

  throw lastError;
}

async function fetchJson(url, options = {}) {
  const raw = await requestText(url, options);
  return JSON.parse(raw);
}

async function fetchText(url, options = {}) {
  return requestText(url, options);
}

/**
 * Fetch one page of discounted games from the store search.
 *
 * @param {{ region?: string, start?: number, count?: number, sortBy?: string }} [options]
 */
async function fetchSearchDealPage({
  region = DEFAULT_REGION,
  start = 0,
  count = 100,
  sortBy = 'Discount_DESC',
} = {}) {
  const url =
    `${SEARCH_URL}?specials=1&hidef2p=0&infinite=1&json=1` +
    `&start=${encodeURIComponent(String(start))}&count=${encodeURIComponent(String(count))}` +
    `&sort_by=${encodeURIComponent(sortBy)}&cc=${encodeURIComponent(region)}&l=en`;

  const raw = await fetchText(url);
  let payload;

  try {
    payload = JSON.parse(raw);
  } catch {
    return { deals: parseSearchDealRows(raw, { region }), totalCount: null };
  }

  return {
    deals: parseSearchDealRows(payload?.results_html || '', { region }),
    totalCount: Number(payload?.total_count) || null,
  };
}

/**
 * Fetch the store front-page specials (daily/weekly deals with expiry dates).
 *
 * @param {{ region?: string }} [options]
 */
async function fetchFeaturedDeals({ region = DEFAULT_REGION } = {}) {
  const payload = await fetchJson(`${FEATURED_URL}?cc=${encodeURIComponent(region)}&l=en`);
  return parseFeaturedDeals(payload, { region });
}

/**
 * Normalize one CheapShark deal (storeID=1 = Steam). CheapShark is the fallback
 * source for when Steam's own store endpoints block the bot; prices are USD.
 *
 * @param {any} item
 */
function parseCheapSharkDeal(item) {
  if (!item || typeof item !== 'object') return null;

  const appId = String(item.steamAppID || '').trim();
  if (!/^\d+$/.test(appId)) return null;

  const title = cleanText(item.title);
  if (!title) return null;

  const discountPercent = Math.round(Number(item.savings));
  if (!Number.isFinite(discountPercent) || discountPercent < 5) return null;

  const normalPrice = Number(item.normalPrice);
  const salePrice = Number(item.salePrice);

  return {
    appId,
    id: `deal_${appId}`,
    title,
    discountPercent,
    priceOriginal: Number.isFinite(normalPrice) ? `$${normalPrice.toFixed(2)}` : null,
    priceFinal: Number.isFinite(salePrice) ? `$${salePrice.toFixed(2)}` : null,
    finalPriceCents: Number.isFinite(salePrice) ? Math.round(salePrice * 100) : null,
    currency: 'USD',
    reviewSummary: cleanText(item.steamRatingText) || null,
    reviewPercent: Number(item.steamRatingPercent) || null,
    reviewCount: Number(item.steamRatingCount) || 0,
    releaseDate: null,
    url: `https://store.steampowered.com/app/${appId}/`,
    imageUrl: steamHeaderImageUrl(appId) || item.thumb || null,
    capsuleUrl: item.thumb || null,
    endsAt: null,
    region: 'cheapshark',
    source: 'cheapshark',
  };
}

function parseCheapSharkDeals(payload) {
  return (Array.isArray(payload) ? payload : []).map(parseCheapSharkDeal).filter(Boolean);
}

/**
 * Fetch Steam deals from CheapShark (fallback source).
 *
 * @param {{ pages?: number, pageSize?: number }} [options]
 */
async function fetchCheapSharkDeals({ pages = 3, pageSize = 60 } = {}) {
  const pageCount = clampInt(pages, 1, 6, 3);
  const size = clampInt(pageSize, 20, 60, 60);
  const lists = [];

  for (let page = 0; page < pageCount; page += 1) {
    // CheapShark's desc flag is inverted: desc=0 returns the deepest discounts first.
    const url =
      `${CHEAPSHARK_URL}?storeID=1&onSale=1&pageSize=${size}&pageNumber=${page}` +
      `&sortBy=Savings&desc=0&lowerPrice=0`;

    try {
      const payload = await fetchJson(url, { retries: 1 });
      lists.push(parseCheapSharkDeals(payload));
    } catch (error) {
      console.warn(`CheapShark deals page ${page} failed: ${error.message}`);
      break;
    }

    if (page < pageCount - 1) await sleep(CHEAPSHARK_PAGE_DELAY_MS);
  }

  return mergeDealLists(...lists);
}

/**
 * Full deals snapshot: biggest discounts + best-reviewed discounts + featured.
 * Falls back to CheapShark when Steam's store endpoints refuse to serve us.
 *
 * @param {{ region?: string, pages?: number, perPage?: number }} [options]
 */
async function fetchSteamStoreDeals({ region = DEFAULT_REGION, pages = 2, perPage = 100 } = {}) {
  const pageCount = clampInt(pages, 1, 4, 2);
  const pageSize = clampInt(perPage, 25, 100, 100);
  const sources = [];
  const lists = [];
  let totalDiscounted = null;
  let featuredCount = 0;
  let failedRequests = 0;
  const cooldown = isSteamStoreCoolingDown();

  if (!cooldown) {
    const requests = [];
    for (let page = 0; page < pageCount; page += 1) {
      requests.push(
        fetchSearchDealPage({
          region,
          start: page * pageSize,
          count: pageSize,
          sortBy: 'Discount_DESC',
        })
      );
    }
    // One page sorted by reviews surfaces popular games with smaller (but real) cuts.
    requests.push(
      fetchSearchDealPage({ region, start: 0, count: pageSize, sortBy: 'Reviews_DESC' })
    );

    const settled = await Promise.allSettled(requests);

    for (const result of settled) {
      if (result.status !== 'fulfilled') {
        failedRequests += 1;
        continue;
      }
      if (Number.isFinite(result.value.totalCount) && !totalDiscounted) {
        totalDiscounted = result.value.totalCount;
      }
      lists.push(result.value.deals);
    }
    if (lists.some((list) => list.length > 0)) sources.push('steam_search');

    const featured = await fetchFeaturedDeals({ region }).catch(() => []);
    if (featured.length > 0) {
      lists.push(featured);
      featuredCount = featured.length;
      sources.push('steam_featured');
    }
  } else {
    failedRequests += 1;
  }

  let deals = mergeDealLists(...lists);

  // Too few results (blocked, empty or a quiet store day) — top up from CheapShark.
  const MIN_USABLE_DEALS = 25;
  if (deals.length < MIN_USABLE_DEALS) {
    const cheapSharkDeals = await fetchCheapSharkDeals({ pages: 3, pageSize: 60 }).catch(() => []);
    if (cheapSharkDeals.length > 0) {
      deals = mergeDealLists(deals, cheapSharkDeals);
      sources.push('cheapshark');
    }
  }

  deals.sort(
    (left, right) =>
      scoreDeal(right) - scoreDeal(left) || String(left.title).localeCompare(String(right.title))
  );

  return {
    deals,
    region,
    totalDiscounted,
    sampledCount: lists.reduce((sum, list) => sum + list.length, 0),
    featuredCount,
    sources,
    steamBlocked: isSteamStoreCoolingDown(),
    failedRequests,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  DEFAULT_DEAL_SETTINGS,
  DEFAULT_REGION,
  cleanText,
  cooldownRemainingMs,
  fetchCheapSharkDeals,
  fetchFeaturedDeals,
  fetchSearchDealPage,
  fetchSteamStoreDeals,
  formatCents,
  isSteamStoreCoolingDown,
  mergeDealLists,
  parseCheapSharkDeal,
  parseCheapSharkDeals,
  parseFeaturedDeal,
  parseFeaturedDeals,
  parseSearchDealRow,
  parseSearchDealRows,
  scoreDeal,
  selectDeals,
  steamHeaderImageUrl,
};
