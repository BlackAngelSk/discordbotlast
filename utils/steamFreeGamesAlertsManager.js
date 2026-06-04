const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamFreeGamesAlerts.json');
const API_URL = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';
const STEAM_FEATURED_URL = 'https://store.steampowered.com/api/featuredcategories?cc=US&l=en';
const STEAM_APPDETAILS_BASE = 'https://store.steampowered.com/api/appdetails?filters=basic,price_overview,short_description,categories,detailed_description&appids=';
const STEAMDB_UPCOMING_FREE_URL = 'https://steamdb.info/upcoming/free/';
const STEAMDB_COOKIE = String(process.env.STEAMDB_COOKIE || '').trim();
const POLL_INTERVAL = 30 * 60 * 1000;
const STEAM_PROMO_CANDIDATE_LIMIT = 48;
const STEAM_PROMO_CONCURRENCY = 6;

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com)',
                Accept: 'application/json'
            }
        }, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                try {
                    resolve(JSON.parse(data));
                } catch (parseError) {
                    reject(new Error(`Invalid JSON response from Steam giveaways API: ${parseError.message}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Steam giveaways API request timed out'));
        });
    });
}

function sanitizeText(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(value, maxLength) {
    const safeValue = String(value || '').trim();
    if (!safeValue || safeValue.length <= maxLength) return safeValue;
    return `${safeValue.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function toUnixTimestamp(value) {
    if (!value || /^n\/?a$/i.test(String(value))) return null;
    const timestamp = Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeGiveaway(item) {
    const platforms = String(item?.platforms || '');
    if (!/steam/i.test(platforms)) return null;

    const id = String(item?.id || '').trim();
    const title = sanitizeText(item?.title || item?.gamerpower_url || 'Steam free game');
    const description = truncate(sanitizeText(item?.description || item?.instructions || ''), 350);

    if (!id || !title) return null;

    return {
        id,
        title: title.replace(/\s*\(steam\)\s*giveaway$/i, '').trim(),
        description,
        worth: sanitizeText(item?.worth || 'Free'),
        url: item?.open_giveaway_url || item?.gamerpower_url || 'https://store.steampowered.com/',
        imageUrl: item?.image || item?.thumbnail || null,
        instructions: sanitizeText(item?.instructions || ''),
        publishedDate: item?.published_date || null,
        endDate: item?.end_date || null,
        type: sanitizeText(item?.type || 'Game'),
        platforms
    };
}

function isTemporaryPromoGiveaway(giveaway) {
    const content = [
        giveaway?.title,
        giveaway?.description,
        giveaway?.instructions,
        giveaway?.type
    ].join(' ').toLowerCase();

    // Anything explicitly marked as free-to-keep is NOT a promo
    if (/free\s*to\s*keep|keep\s+it\s+forever|claim\s+and\s+keep|keep\s+forever|add(?:ed)?\s+to\s+(?:your\s+)?library\s+permanently|permanently\s+(?:yours|free)|own\s+it\s+forever/.test(content)) {
        return false;
    }

    // Explicit promo / free-weekend / trial language
    // Does NOT include "free on steam until" or "free until" which are giveaway phrases
    const hasPromoLanguage = /free\s*weekend|weekend\s*free|temporar(?:y|ily)\s+free|free\s*trial|play\s+(?:it\s+)?free\s+(?:this\s+)?weekend|limited[\s-]time(?:\s+free)?|free\s*to\s*play\s+for\s+(?:a\s+)?limited\s+time|play\s+for\s+free\s+for\s+limited\s+time|available\s+to\s+play\s+free|play\s+free\s+(?:now\s+)?until|free\s+access\s+(?:until|ends?|through)|will\s+be\s+removed|removed\s+from\s+(?:your\s+)?library|removed\s+after|disappear(?:s|ing)?|no\s+longer\s+(?:available|accessible)\s+after|access\s+ends?\s+(?:on|at)|weekend\s+deal|free\s+play\s+event|play\s+free\s+this\s+week(?:end)?|trial\s+period|demo\s+free|for\s+a\s+limited\s+time\s+only|you\s+will\s+lose|lose\s+access/.test(content);
    
    // Only classify as temporary promo if it has explicit promo language
    if (hasPromoLanguage) return true;
    
    return false;
}

function dedupeGiveaways(giveaways) {
    const seen = new Set();
    const unique = [];

    for (const giveaway of giveaways) {
        const key = `${giveaway.id}:${giveaway.endDate || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(giveaway);
    }

    return unique;
}

function formatGiveawayLine(giveaway) {
    const parts = [`• **${giveaway.title}**`];
    if (giveaway.worth && !/^n\/?a$/i.test(giveaway.worth)) {
        parts.push(`was ${giveaway.worth}`);
    }

    const endUnix = toUnixTimestamp(giveaway.endDate);
    if (endUnix) {
        parts.push(`ends <t:${endUnix}:F>`);
    }

    return `${parts.join(' - ')}\n${giveaway.url}`;
}

function createSummaryEmbed(giveaways) {
    return new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(giveaways.length > 1 ? '🎮 Free Steam Games Available Now' : '🎮 Free Steam Game Available Now')
        .setURL('https://store.steampowered.com/')
        .setDescription(giveaways.map(formatGiveawayLine).join('\n\n'))
        .setFooter({ text: 'Steam free game alerts' })
        .setTimestamp();
}

function formatPromoLine(giveaway) {
    const parts = [`• **${giveaway.title}**`];

    const retailValue = giveaway.worth && !/^n\/?a$/i.test(giveaway.worth) ? giveaway.worth : 'Paid game';
    parts.push(`💵 price: ${retailValue}`);

    const endUnix = toUnixTimestamp(giveaway.endDate);
    if (endUnix) {
        parts.push(`⏰ ends <t:${endUnix}:R>`);
    } else {
        parts.push('⏰ ends: limited time');
    }

    return parts.join(' — ');
}

function createPromoSummaryEmbed(giveaways) {
    return new EmbedBuilder()
        .setColor(0xf4a318)
    .setTitle(giveaways.length > 1 ? '🕹️ Steam Promo Games — Play For Free Now' : '🕹️ Steam Promo Game — Play For Free Now')
        .setURL('https://store.steampowered.com/specials')
        .setDescription(giveaways.map(formatPromoLine).join('\n\n'))
    .setFooter({ text: 'Steam promo game alerts • Limited-time access' })
        .setTimestamp();
}

function createPromoRotationEmbed(currentGiveaways, removedTitles = []) {
    const removedLabel = removedTitles.length > 0
        ? removedTitles.map(title => `• ${title}`).join('\n')
        : '• One or more games expired';

    if (currentGiveaways.length === 0) {
        return new EmbedBuilder()
            .setColor(0xf4a318)
            .setTitle('🕹️ Steam Promo Games Updated')
            .setDescription([
                '**Expired promos removed:**',
                removedLabel,
                '',
                'No Steam promo games are currently active.'
            ].join('\n'))
            .setFooter({ text: 'Steam promo game alerts • Limited-time free play' })
            .setTimestamp();
    }

    return new EmbedBuilder()
        .setColor(0xf4a318)
        .setTitle('🕹️ Steam Promo Games Updated')
        .setURL('https://store.steampowered.com/specials')
        .setDescription([
            '**Expired promos removed:**',
            removedLabel,
            '',
            '**Currently active promos:**',
            currentGiveaways.map(formatPromoLine).join('\n\n')
        ].join('\n'))
        .setFooter({ text: 'Steam promo game alerts • Limited-time free play' })
        .setTimestamp();
}

function createPromoEmbed(giveaway) {
    const endUnix = toUnixTimestamp(giveaway.endDate);
    const retailValue = giveaway.worth && !/^n\/?a$/i.test(giveaway.worth) ? giveaway.worth : 'Paid game';
    const lines = [
        endUnix ? `⏰ Ends: <t:${endUnix}:F> (<t:${endUnix}:R>)` : '⏰ Ends: limited time',
        `💵 Price: ${retailValue}`
    ];

    const embed = new EmbedBuilder()
        .setColor(0xf4a318)
        .setTitle(`🕹️ ${giveaway.title} — Free to Play Now`)
        .setURL(giveaway.url)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Steam promo game alerts • Limited-time free play' })
        .setTimestamp();

    if (giveaway.imageUrl) {
        embed.setImage(giveaway.imageUrl);
    }

    return embed;
}

function createGiveawayEmbed(giveaway) {
    const details = [];

    if (giveaway.description) {
        details.push(giveaway.description);
    }

    const endUnix = toUnixTimestamp(giveaway.endDate);
    const publishedUnix = toUnixTimestamp(giveaway.publishedDate);
    const timing = [];

    if (publishedUnix) {
        timing.push(`Posted <t:${publishedUnix}:F>`);
    }

    if (endUnix) {
        timing.push(`Ends <t:${endUnix}:F>`);
    }

    if (timing.length > 0) {
        details.push(timing.join('\n'));
    }

    if (giveaway.instructions) {
        details.push(`Claim: ${truncate(giveaway.instructions, 180)}`);
    }

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(`🎁 ${giveaway.title}`)
        .setURL(giveaway.url)
        .setDescription(details.join('\n\n') || giveaway.url)
        .addFields(
            {
                name: 'Value',
                value: giveaway.worth || 'Free',
                inline: true
            },
            {
                name: 'Platform',
                value: giveaway.platforms || 'Steam',
                inline: true
            },
            {
                name: 'Type',
                value: giveaway.type || 'Game',
                inline: true
            }
        )
        .setFooter({ text: 'Steam free game alerts' })
        .setTimestamp();

    if (giveaway.imageUrl) {
        embed.setImage(giveaway.imageUrl);
    }

    return embed;
}

async function steamHttpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const zlib = require('zlib');
        const req = https.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate',
                'Cookie': 'birthtime=631152001; lastagecheckage=1-January-2000; wants_mature_content=1'
            }
        }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const enc = (res.headers['content-encoding'] || '').toLowerCase();
                const decompress = enc === 'gzip' ? zlib.gunzip : enc === 'deflate' ? zlib.inflate : null;
                const decode = (b) => {
                    try { return resolve(JSON.parse(b.toString('utf8'))); }
                    catch (e) { reject(new Error(`Steam API JSON parse error: ${e.message}`)); }
                };
                if (decompress) {
                    decompress(buf, (err, result) => err ? reject(err) : decode(result));
                } else {
                    decode(buf);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('Steam store request timed out')); });
    });
}

async function steamHttpsGetText(url) {
    return new Promise((resolve, reject) => {
        const zlib = require('zlib');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate'
        };

        if (STEAMDB_COOKIE) {
            headers.Cookie = STEAMDB_COOKIE;
        }

        const req = https.get(url, {
            timeout: 15000,
            headers
        }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const enc = (res.headers['content-encoding'] || '').toLowerCase();

                const done = binary => {
                    const text = binary.toString('utf8');
                    const isOkStatus = res.statusCode >= 200 && res.statusCode < 300;
                    const isCloudflareChallenge = /cf-mitigated|just a moment|checking your browser|enable javascript/i.test(text);

                    if (isOkStatus || isCloudflareChallenge) {
                        return resolve(text);
                    }

                    return reject(new Error(`HTTP ${res.statusCode}`));
                };

                if (enc === 'gzip') return zlib.gunzip(buf, (err, out) => err ? reject(err) : done(out));
                if (enc === 'deflate') return zlib.inflate(buf, (err, out) => err ? reject(err) : done(out));

                done(buf);
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('SteamDB request timed out')); });
    });
}

function steamDbLooksBlocked(html) {
    return /cf-mitigated|just a moment|checking your browser|enable javascript/i.test(String(html || ''));
}

async function steamDbGetTextWithBypass(url) {
    const html = await steamHttpsGetText(url);
    if (!steamDbLooksBlocked(html)) return html;

    // Fallback for Cloudflare challenges when direct HTTPS fetch returns anti-bot HTML.
    try {
        const cloudscraper = require('cloudscraper');
        const response = await cloudscraper.get({
            uri: url,
            gzip: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(STEAMDB_COOKIE ? { Cookie: STEAMDB_COOKIE } : {})
            },
            timeout: 15000
        });

        return String(response || '');
    } catch {
        return html;
    }
}

function extractAppIdFromString(str) {
    if (!str) return null;
    const m = String(str).match(/\/apps?\/(\d+)/);
    return m ? m[1] : null;
}

function steamHeaderImageUrl(appId) {
    const normalized = String(appId || '').trim();
    if (!/^\d+$/.test(normalized)) return null;
    return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${normalized}/header.jpg`;
}

function stripHtmlTags(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseSteamDbDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return null;
        const milliseconds = numeric > 1e12 ? numeric : numeric * 1000;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractSteamDbPromoTitle(block) {
    const anchorMatches = [...String(block || '').matchAll(/<a[^>]+href="\/app\/\d+\/[^\"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const match of anchorMatches) {
        const text = stripHtmlTags(match[1]);
        if (text && !/^play\s+for\s+free$/i.test(text)) return text;
    }

    const dataTitleMatch = String(block || '').match(/data-title="([^"]+)"/i);
    if (dataTitleMatch?.[1]) return stripHtmlTags(dataTitleMatch[1]);

    const titleMatch = String(block || '').match(/title="([^"]+)"/i);
    if (titleMatch?.[1]) return stripHtmlTags(titleMatch[1]);

    return null;
}

function extractSteamDbPromoEndDate(block) {
    const text = stripHtmlTags(block);

    const datetimeMatch = String(block || '').match(/datetime="([^"]+)"/i);
    const timestampMatch = String(block || '').match(/data-(?:time|until|end)="([^"]+)"/i);
    const titleMatch = String(block || '').match(/title="([^"]+)"/i);

    return parseSteamDbDate(datetimeMatch?.[1])
        || parseSteamDbDate(timestampMatch?.[1])
        || parseSteamDbDate(titleMatch?.[1])
        || parseSteamDbDate(text.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+[a-z]{3,9}\s+\d{1,2},?\s+\d{4}\b/i)?.[0])
        || parseSteamDbDate(text.match(/\b[a-z]{3,9}\s+\d{1,2},?\s+\d{4}\b/i)?.[0])
        || null;
}

function parseSteamDbPlayForFreePromos(html) {
    const promos = [];
    const source = String(html || '');

    // Accept class order/spacing variations (e.g. "cat cat-play-for-free" or "cat-play-for-free cat").
    const markerRegex = /<[^>]*class=["'][^"']*\bcat-play-for-free\b[^"']*["'][^>]*>\s*play\s*for\s*free\s*<\/[^>]+>/gi;
    const blocks = [];
    let markerMatch;
    while ((markerMatch = markerRegex.exec(source)) !== null) {
        const start = Math.max(0, markerMatch.index - 9000);
        const end = Math.min(source.length, markerMatch.index + 9000);
        blocks.push(source.slice(start, end));
    }

    const seenPromoIds = new Set();
    for (const block of blocks) {
        const appIdMatches = [...String(block || '').matchAll(/\/app\/(\d+)\//gi)];
        const appId = appIdMatches.length > 0 ? appIdMatches[appIdMatches.length - 1][1] : extractAppIdFromString(block);
        if (!appId) continue;
        if (seenPromoIds.has(appId)) continue;
        seenPromoIds.add(appId);

        const title = extractSteamDbPromoTitle(block) || `Steam App ${appId}`;
        promos.push({
            id: `steamdb_${appId}`,
            title,
            description: 'Play For Free on SteamDB',
            worth: 'Paid game',
            url: `https://store.steampowered.com/app/${appId}/`,
            imageUrl: steamHeaderImageUrl(appId),
            instructions: 'Check the SteamDB upcoming free page and open the Steam store page while the Play For Free offer is active.',
            publishedDate: null,
            endDate: extractSteamDbPromoEndDate(block),
            type: 'Game',
            platforms: 'Steam'
        });
    }

    return promos;
}

function extractSteamStoreAppName(html, appId) {
    const nameMatch = String(html || '').match(/<div[^>]*id="appHubAppName"[^>]*>([\s\S]*?)<\/div>/i);
    const parsed = sanitizeText(nameMatch?.[1] || '');
    return parsed || `Steam App ${appId}`;
}

function extractSteamStoreOgImage(html, appId) {
    const ogImageMatch = String(html || '').match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImageMatch?.[1]) return String(ogImageMatch[1]).trim();
    return steamHeaderImageUrl(appId);
}

function extractSteamStorePlayFreeEndDate(html) {
    const parseSteamShortDate = (rawValue) => {
        const raw = String(rawValue || '').trim();
        if (!raw) return null;

        const direct = new Date(raw);
        if (!Number.isNaN(direct.getTime())) return direct.toISOString();

        const normalized = raw
            .replace(/@/g, ' ')
            .replace(/[.,]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const monthMap = {
            jan: 0,
            feb: 1,
            mar: 2,
            apr: 3,
            may: 4,
            jun: 5,
            jul: 6,
            aug: 7,
            sep: 8,
            sept: 8,
            oct: 9,
            nov: 10,
            dec: 11
        };

        // Formats handled:
        // 1) "9 Jun 7:00am"
        // 2) "Jun 9 7:00am"
        // 3) same forms without time
        let match = normalized.match(/^(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
        let day;
        let monthText;
        let hourText = null;
        let minuteText = null;
        let ampm = null;

        if (match) {
            day = Number(match[1]);
            monthText = String(match[2]).toLowerCase();
            hourText = match[3] || null;
            minuteText = match[4] || null;
            ampm = match[5] || null;
        } else {
            match = normalized.match(/^([a-z]{3,9})\s+(\d{1,2})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
            if (!match) return null;
            monthText = String(match[1]).toLowerCase();
            day = Number(match[2]);
            hourText = match[3] || null;
            minuteText = match[4] || null;
            ampm = match[5] || null;
        }

        const month = monthMap[monthText.slice(0, 4)] ?? monthMap[monthText.slice(0, 3)];
        if (!Number.isFinite(month) || !Number.isFinite(day)) return null;

        let hour = Number(hourText || 0);
        const minute = Number(minuteText || 0);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

        const period = String(ampm || '').toLowerCase();
        if (period === 'pm' && hour < 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        const now = new Date();
        let year = now.getUTCFullYear();
        let utc = new Date(Date.UTC(year, month, day, hour, minute, 0));

        // If parsed date is clearly in the past, assume next year (year boundary protection).
        if (utc.getTime() < now.getTime() - (2 * 24 * 60 * 60 * 1000)) {
            year += 1;
            utc = new Date(Date.UTC(year, month, day, hour, minute, 0));
        }

        return Number.isNaN(utc.getTime()) ? null : utc.toISOString();
    };

    const source = String(html || '');

    const explicitDateMatch = source.match(/play\s+for\s+free\s+until\s*([^<\n]+)/i);
    if (explicitDateMatch?.[1]) {
        const parsed = parseSteamShortDate(explicitDateMatch[1]);
        if (parsed) return parsed;
    }

    const expiresLabelMatch = source.match(/expires?\s*:\s*([^<\n]+)/i);
    if (expiresLabelMatch?.[1]) {
        const parsed = parseSteamShortDate(expiresLabelMatch[1]);
        if (parsed) return parsed;
    }

    return null;
}

async function checkSteamStoreAppForPlayFree(appId) {
    try {
        const html = await steamHttpsGetText(`https://store.steampowered.com/app/${appId}/?cc=US&l=en`);
        const hasPlayFreeText = /play\s+for\s+free\s+until|play\s+for\s+free/i.test(html);
        const hasFreeButton = /id="freeGameBtn"|ShowAddFreeLicense\(/i.test(html);

        if (!hasPlayFreeText || !hasFreeButton) return null;

        const title = extractSteamStoreAppName(html, appId);
        return {
            id: `steam_store_${appId}`,
            title,
            description: 'Play for free for a limited time on Steam.',
            worth: 'Paid game',
            url: `https://store.steampowered.com/app/${appId}/`,
            imageUrl: extractSteamStoreOgImage(html, appId),
            instructions: 'Open the Steam store page and click Play Game. Access is removed after the promotion ends unless purchased.',
            publishedDate: null,
            endDate: extractSteamStorePlayFreeEndDate(html),
            type: 'Game',
            platforms: 'Steam'
        };
    } catch {
        return null;
    }
}

async function fetchSteamStorePromosFallback() {
    try {
        const search = await steamHttpsGetJson(
            'https://store.steampowered.com/search/results/?specials=1&hidef2p=0&json=1&cc=US&l=en&count=120'
        );

        const items = Array.isArray(search?.items) ? search.items : [];
        const seen = new Set();
        const candidateAppIds = [];

        for (const item of items) {
            const possibleIds = [
                String(item?.id || '').trim(),
                extractAppIdFromString(item?.url),
                extractAppIdFromString(item?.logo)
            ].filter(Boolean);

            for (const id of possibleIds) {
                const normalized = String(id).trim();
                if (!/^\d+$/.test(normalized)) continue;
                if (seen.has(normalized)) continue;
                seen.add(normalized);
                candidateAppIds.push(normalized);
            }
        }

        const checked = await mapWithConcurrency(
            candidateAppIds.slice(0, STEAM_PROMO_CANDIDATE_LIMIT),
            STEAM_PROMO_CONCURRENCY,
            id => checkSteamStoreAppForPlayFree(id)
        );

        const promos = [];
        const seenTitles = new Set();
        for (const promo of checked) {
            if (!promo) continue;
            const key = String(promo.title || '').toLowerCase();
            if (!key || seenTitles.has(key)) continue;
            seenTitles.add(key);
            promos.push(promo);
        }

        return promos;
    } catch {
        return [];
    }
}

async function mapWithConcurrency(items, concurrency, task) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) break;

            try {
                results[index] = await task(items[index], index);
            } catch {
                results[index] = null;
            }
        }
    });

    await Promise.all(workers);
    return results;
}

async function checkSteamAppForFreeWeekend(appId) {
    try {
        const details = await steamHttpsGetJson(`${STEAM_APPDETAILS_BASE}${appId}&cc=US`);
        const appData = details?.[appId];
        if (!appData?.success || !appData?.data) return null;

        const data = appData.data;
        const po = data.price_overview;

        // Steam category id 35 = "Free Weekend"
        const hasFreeWeekendCategory = Array.isArray(data.categories) &&
            data.categories.some(c => c.id === 35);

        // detailed_description starting with <h1>Free Weekend</h1> — used by some store events
        const hasFreeWeekendBanner = typeof data.detailed_description === 'string' &&
            /^\s*<h1>\s*Free\s+Weekend/i.test(data.detailed_description);

        const nowUnix = Math.floor(Date.now() / 1000);
        const discountExpiration = Number(po?.discount_expiration);
        const hasActiveDiscountWindow = Number.isFinite(discountExpiration) && discountExpiration > nowUnix;
        const hasExpiredDiscountWindow = Number.isFinite(discountExpiration) && discountExpiration <= nowUnix;

        const promoText = `${sanitizeText(data.short_description || '')} ${sanitizeText(data.detailed_description || '')}`.toLowerCase();
        const hasPlayFreeText = /play\s+(?:it\s+)?free\s+(?:this\s+)?weekend|free\s*weekend|weekend\s*free|free\s*trial|free\s*to\s*play\s+for\s+(?:a\s+)?limited\s+time|play\s+for\s+free\s+for\s+limited\s+time|play\s+free\s+(?:now\s+)?until|free\s+access\s+(?:until|ends?|through)|trial\s+period|limited[\s-]time/.test(promoText);
        const hasStaleText = /no\s+longer\s+(?:available|accessible)|promotion\s+ended|offer\s+ended|event\s+ended|free\s+weekend\s+has\s+ended/.test(promoText);

        // Paid games on temporary free access are often marked 100% off, but metadata is not always consistent.
        const hasLiveFreeWeekendPricing = Boolean(
            po
            && po.discount_percent === 100
            && po.initial > 0
            && !data.is_free
            && (hasActiveDiscountWindow || !Number.isFinite(discountExpiration))
        );

        // Category 35 often marks weekend deals (discounts), not necessarily free-to-play events.
        // Only allow explicit free-play signals: 100% free weekend pricing, free-weekend banner text,
        // or strong play-free wording in descriptions.
        const hasExplicitPlayFreeSignal = hasLiveFreeWeekendPricing || hasFreeWeekendBanner || hasPlayFreeText;
        const isLikelyActivePromo = hasExplicitPlayFreeSignal && !hasStaleText;

        if (hasExpiredDiscountWindow) return null;
        if (!isLikelyActivePromo) return null;

        let endDate = null;
        if (po?.discount_expiration && Number.isFinite(Number(po.discount_expiration))) {
            endDate = new Date(Number(po.discount_expiration) * 1000).toISOString();
        }

        const originalPrice = po?.initial > 0 ? `$${(po.initial / 100).toFixed(2)}` : null;

        return {
            id: `steam_store_${appId}`,
            title: sanitizeText(data.name || `Steam App ${appId}`),
            description: truncate(sanitizeText(data.short_description || ''), 350),
            worth: originalPrice,
            url: `https://store.steampowered.com/app/${appId}/`,
            imageUrl: data.header_image || null,
            instructions: 'Visit the Steam store page and click "Play Free" or "Play Free Weekend". The game will be removed from your library after the promotion ends.',
            publishedDate: null,
            endDate,
            type: 'Game',
            platforms: 'Steam'
        };
    } catch {
        return null;
    }
}

async function fetchSteamStorePromos() {
    try {
        const html = await steamDbGetTextWithBypass(STEAMDB_UPCOMING_FREE_URL);
        if (steamDbLooksBlocked(html)) {
            return fetchSteamStorePromosFallback();
        }

        const steamDbPromos = parseSteamDbPlayForFreePromos(html);
        if (steamDbPromos.length > 0) return steamDbPromos;

        return fetchSteamStorePromosFallback();
    } catch (err) {
        if (/HTTP 403/.test(String(err?.message || ''))) return [];
        console.error('fetchSteamStorePromos error:', err.message);
        return [];
    }
}

class SteamFreeGamesAlertsManager {
    constructor() {
        this.client = null;
        this.interval = null;
        this.data = { guilds: {} };
        this.pollInFlight = false;
        this._snapshotCache = null;
        this._snapshotCachedAt = 0;
        this._snapshotInFlight = null;
    }

    async init(client) {
        this.client = client;

        try {
            await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading Steam free game alerts config:', error);
            }
        }

        if (!this.data.promoGuilds) this.data.promoGuilds = {};

        this.startPolling();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    getGuildConfig(guildId) {
        return this.data.guilds[guildId] || null;
    }

    getPromoGuildConfig(guildId) {
        return (this.data.promoGuilds ?? {})[guildId] || null;
    }

    isFeatureEnabled(guildId) {
        const settings = settingsManager.get(guildId);
        return settings.features?.steamFreeGamesAlerts !== false;
    }

    async enablePromoAlerts(guildId, channelId) {
        const snapshot = await this.fetchSnapshot().catch(error => {
            console.error('Steam promo snapshot fetch failed while enabling alerts:', error.message);
            return null;
        });

        if (!this.data.promoGuilds) this.data.promoGuilds = {};

        this.data.promoGuilds[guildId] = {
            channelId,
            announcedIds: snapshot ? snapshot.promoGiveaways.map(g => g.id) : [],
            announcedMeta: snapshot ? snapshot.promoGiveaways.map(g => ({ id: g.id, title: g.title })) : [],
            lastCheckedAt: new Date().toISOString()
        };

        await this.save();
        return snapshot;
    }

    async disablePromoAlerts(guildId) {
        if (this.data.promoGuilds) delete this.data.promoGuilds[guildId];
        await this.save();
    }

    buildPromoAlert(snapshot, giveaways = snapshot?.promoGiveaways || []) {
        if (!Array.isArray(giveaways) || giveaways.length === 0) return null;

        return {
            messages: [
                { embeds: [createPromoSummaryEmbed(giveaways)] },
                ...giveaways.map(g => ({ embeds: [createPromoEmbed(g)] }))
            ]
        };
    }

    async enableAlerts(guildId, channelId) {
        const snapshot = await this.fetchSnapshot().catch(error => {
            console.error('Steam free games snapshot fetch failed while enabling alerts:', error.message);
            return null;
        });

        this.data.guilds[guildId] = {
            channelId,
            announcedIds: snapshot ? snapshot.freeToKeepGiveaways.map(giveaway => giveaway.id) : [],
            lastCheckedAt: new Date().toISOString()
        };

        await this.save();
        return snapshot;
    }

    async disableAlerts(guildId) {
        delete this.data.guilds[guildId];
        await this.save();
    }

    async fetchSnapshot() {
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        if (this._snapshotCache && now - this._snapshotCachedAt < CACHE_TTL) {
            return this._snapshotCache;
        }
        // Dedupe concurrent fetches — only one HTTP call in flight at a time
        if (this._snapshotInFlight) {
            return this._snapshotInFlight;
        }
        this._snapshotInFlight = this._doFetchSnapshot().then(result => {
            this._snapshotCache = result;
            this._snapshotCachedAt = Date.now();
            this._snapshotInFlight = null;
            return result;
        }).catch(err => {
            this._snapshotInFlight = null;
            throw err;
        });
        return this._snapshotInFlight;
    }

    async _doFetchSnapshot() {
        const payload = await httpsGetJson(API_URL);
        if (!Array.isArray(payload)) {
            throw new Error(`Steam giveaways API returned an unexpected payload: ${typeof payload}`);
        }

        const giveaways = dedupeGiveaways(payload.map(normalizeGiveaway).filter(Boolean))
            .sort((left, right) => {
                const leftEnd = new Date(left.endDate || 0).getTime();
                const rightEnd = new Date(right.endDate || 0).getTime();
                return leftEnd - rightEnd || left.title.localeCompare(right.title);
            });

        // GamerPower temporary promos (games that will be removed from library after giveaway)
        const gpPromos = giveaways.filter(isTemporaryPromoGiveaway);
        const freeToKeepGiveaways = giveaways.filter(giveaway => !isTemporaryPromoGiveaway(giveaway));

        // Steam store promos (100%-off paid games = free weekends / events)
        const steamStorePromos = await fetchSteamStorePromos();

        // Promo stream includes both temporary GamerPower giveaways and Steam play-for-free events
        const promoGiveaways = [...gpPromos, ...steamStorePromos]
            .sort((a, b) => {
                const aEnd = new Date(a.endDate || 0).getTime();
                const bEnd = new Date(b.endDate || 0).getTime();
                return aEnd - bEnd || a.title.localeCompare(b.title);
            });

        return {
            fetchedAt: new Date().toISOString(),
            giveaways,
            freeToKeepGiveaways,
            promoGiveaways
        };
    }

    invalidateSnapshotCache() {
        this._snapshotCache = null;
        this._snapshotCachedAt = 0;
    }

    buildCurrentAlert(snapshot, giveaways = snapshot?.freeToKeepGiveaways || snapshot?.giveaways || []) {
        if (!Array.isArray(giveaways) || giveaways.length === 0) return null;

        return {
            messages: [
                { embeds: [createSummaryEmbed(giveaways)] },
                ...giveaways.map(giveaway => ({ embeds: [createGiveawayEmbed(giveaway)] }))
            ]
        };
    }

    startPolling() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.poll().catch(error => {
            console.error('Steam free game alert polling failed:', error.message);
        }), POLL_INTERVAL);

        setTimeout(() => {
            this.poll().catch(error => {
                console.error('Initial Steam free game alert poll failed:', error.message);
            });
        }, 18000);
    }

    async poll() {
        if (this.pollInFlight) return;
        this.pollInFlight = true;

        try {
            const snapshot = await this.fetchSnapshot();
            const currentIds = snapshot.freeToKeepGiveaways.map(giveaway => giveaway.id);
            const currentPromoIds = snapshot.promoGiveaways.map(g => g.id);

            for (const [guildId, config] of Object.entries(this.data.guilds)) {
                if (!config?.channelId || !this.isFeatureEnabled(guildId)) continue;

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                const announcedIds = Array.isArray(config.announcedIds) ? config.announcedIds.map(String) : [];
                const newGiveaways = snapshot.freeToKeepGiveaways.filter(giveaway => !announcedIds.includes(String(giveaway.id)));

                if (newGiveaways.length > 0) {
                    const payload = this.buildCurrentAlert(snapshot, newGiveaways);
                    if (payload) {
                        for (const messagePayload of payload.messages) {
                            await channel.send(messagePayload).catch(() => {});
                        }
                    }
                }

                config.announcedIds = currentIds;
                config.lastCheckedAt = snapshot.fetchedAt;
            }

            for (const [guildId, config] of Object.entries(this.data.promoGuilds ?? {})) {
                if (!config?.channelId || !this.isFeatureEnabled(guildId)) continue;

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                const announcedIds = Array.isArray(config.announcedIds) ? config.announcedIds.map(String) : [];
                const announcedMeta = Array.isArray(config.announcedMeta) ? config.announcedMeta : [];
                const currentPromoIdSet = new Set(currentPromoIds.map(String));
                const newPromos = snapshot.promoGiveaways.filter(g => !announcedIds.includes(String(g.id)));
                const removedPromoIds = announcedIds.filter(id => !currentPromoIdSet.has(String(id)));

                if (newPromos.length > 0) {
                    const payload = this.buildPromoAlert(snapshot, newPromos);
                    if (payload) {
                        for (const messagePayload of payload.messages) {
                            await channel.send(messagePayload).catch(() => {});
                        }
                    }
                } else if (removedPromoIds.length > 0) {
                    const removedTitleMap = new Map(
                        announcedMeta
                            .map(entry => [String(entry?.id || ''), entry?.title])
                            .filter(([id, title]) => id && title)
                    );

                    const removedTitles = removedPromoIds
                        .map(id => removedTitleMap.get(String(id)) || `Steam App ${String(id).replace(/^steam_store_/, '')}`)
                        .slice(0, 8);

                    const rotationEmbed = createPromoRotationEmbed(snapshot.promoGiveaways, removedTitles);
                    await channel.send({ embeds: [rotationEmbed] }).catch(() => {});
                }

                config.announcedIds = currentPromoIds;
                config.announcedMeta = snapshot.promoGiveaways.map(g => ({ id: g.id, title: g.title }));
                config.lastCheckedAt = snapshot.fetchedAt;
            }

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new SteamFreeGamesAlertsManager();