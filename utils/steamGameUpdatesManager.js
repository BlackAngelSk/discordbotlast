const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const { toDateObject, toEpochMs } = require('./helpers');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamGameUpdates.json');
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails?l=en&appids=';
const APP_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?maxlength=0&format=json&count=25&appid=';
const APP_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/?l=en&cc=US&term=';
const MINECRAFT_UPDATES_URL = 'https://www.minecraft.net/en-us/updates/';
const MINECRAFT_VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const LEAGUE_PATCH_NOTES_URL = 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/';
const OSU_CHANGELOG_URL = 'https://osu.ppy.sh/home/changelog/lazer';
const OSU_CHANGELOG_API_URL = 'https://osu.ppy.sh/api/v2/changelog/lazer';
const VALORANT_PATCH_NOTES_URL = 'https://playvalorant.com/en-us/news/';
const FFXIV_PATCH_NOTES_URL = 'https://na.finalfantasyxiv.com/lodestone/news/';
const WOW_PATCH_NOTES_URL = 'https://us.battle.net/news/en-us/wow/';
const POE_NEWS_URL = 'https://www.pathofexile.com/en/news';
const FORTNITE_NEWS_URL = 'https://www.fortnite.com/?lang=en-US';
const HELLDIVERS2_NEWS_URL = 'https://www.helldivers.com/';
const DIABLO_NEWS_URL = 'https://diablo4.blizzard.com/en-us/news/';
const OVERWATCH_NEWS_URL = 'https://overwatch.blizzard.com/en-us/news/';
const APEX_NEWS_URL = 'https://www.ea.com/games/apex-legends/news';
const CS2_UPDATE_URL = 'https://blog.counter-strike.net/';
const DOTA2_NEWS_URL = 'https://www.dota2.com/news';
const VALHEIM_NEWS_URL = 'https://www.valheimgame.com/news';
const RUST_NEWS_URL = 'https://rust.facepunch.com/news';
const PUBG_NEWS_URL = 'https://www.pubg.com/en/news';
const NVIDIA_DRIVERS_URL = 'https://www.nvidia.com/en-us/geforce/drivers/';
const NVIDIA_BLOG_URL = 'https://www.nvidia.com/en-us/geforce/news/';
const AMD_DRIVERS_URL = 'https://www.amd.com/en/resources/support-articles/release-notes/RN-RAD-WIN.html';
const AMD_NEWS_URL = 'https://www.amd.com/en/news.html';
const INTEL_DRIVERS_URL = 'https://www.intel.com/content/www/us/en/download/center/home.html';
const INTEL_NEWS_URL = 'https://www.intel.com/content/www/us/en/newsroom.html';

const POLL_INTERVAL = 15 * 60 * 1000;
const MAX_TRACKED_GAMES = 25;
const REQUEST_TIMEOUT = 20000;
const FETCH_RETRY_ATTEMPTS = 2;
const FETCH_RETRY_DELAY_MS = 2000;
const DRIVER_FETCH_TIMEOUT_MS = 30000;
const PROVIDER_FAIL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown after persistent failures
const providerFailCooldowns = new Map(); // module-level: providerKey -> lastFailTimestamp
const providerOngoingFetches = new Map(); // module-level: providerKey -> Promise (dedup concurrent calls)
const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com)'
};

const SPECIAL_TRACKED_SOURCES = {
    minecraft: {
        aliases: ['minecraft', 'mc'],
        sourceId: 'minecraft',
        name: 'Minecraft',
        imageUrl: 'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/screenshots/MCV_SummerDrop2026_BPS_Mar31_Editorial_1920x1080.jpg',
        tinyImage: 'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/screenshots/MCV_SummerDrop2026_BPS_Mar31_Editorial_1920x1080.jpg',
        storeUrl: MINECRAFT_UPDATES_URL,
        color: 0xf59e0b,
        providerLabel: 'Minecraft'
    },
    league: {
        aliases: ['league', 'lol', 'leagueoflegends', 'leagueoflegend', 'league legends'],
        sourceId: 'league',
        name: 'League of Legends',
        imageUrl: 'https://www.leagueoflegends.com/static/open-graph/lol.jpg',
        tinyImage: 'https://www.leagueoflegends.com/static/favicon/10f498b01d7f8c6.ico',
        storeUrl: LEAGUE_PATCH_NOTES_URL,
        color: 0xc89b3c,
        providerLabel: 'League of Legends'
    },
    osu: {
        aliases: ['osu', 'osu!'],
        sourceId: 'osu',
        name: 'osu!',
        imageUrl: 'https://osu.ppy.sh/favicon-32x32.png',
        tinyImage: 'https://osu.ppy.sh/favicon-32x32.png',
        storeUrl: OSU_CHANGELOG_URL,
        color: 0xff66aa,
        providerLabel: 'osu!'
    },
    valorant: {
        aliases: ['valorant', 'val', 'valorant patch'],
        sourceId: 'valorant',
        name: 'Valorant',
        imageUrl: 'https://images.contentstack.io/v3/assets/bltfe521ce715202d33/blt28c73a46e28bd2e1/62f88e90e6d4dd0c88b70e84/VALORANT_2022_E4A_TeaserKeyArt_16x9_02.jpg',
        tinyImage: 'https://www.valorantpc.com/favicon.ico',
        storeUrl: VALORANT_PATCH_NOTES_URL,
        color: 0xff4655,
        providerLabel: 'Valorant'
    },
    ffxiv: {
        aliases: ['ffxiv', 'ff14', 'finalfantasy14', 'final fantasy xiv', 'final fantasy 14'],
        sourceId: 'ffxiv',
        name: 'Final Fantasy XIV',
        imageUrl: 'https://na.finalfantasyxiv.com/pr/dl/news/m_header_lodestone.jpg',
        tinyImage: 'https://na.finalfantasyxiv.com/favicon.ico',
        storeUrl: FFXIV_PATCH_NOTES_URL,
        color: 0x0099ff,
        providerLabel: 'Final Fantasy XIV'
    },
    wow: {
        aliases: ['wow', 'worldofwarcraft', 'world of warcraft'],
        sourceId: 'wow',
        name: 'World of Warcraft',
        imageUrl: 'https://bnetcms-a.akamaihd.net/cms/page_media/p3/P3DV54SA3XCK1522711097119.jpg',
        tinyImage: 'https://us.battle.net/favicon.ico',
        storeUrl: WOW_PATCH_NOTES_URL,
        color: 0x0070dd,
        providerLabel: 'World of Warcraft'
    },
    poe: {
        aliases: ['poe', 'pathofexile', 'path of exile'],
        sourceId: 'poe',
        name: 'Path of Exile',
        imageUrl: 'https://www.pathofexile.com/image/news/PathOfExile2Launch.jpg',
        tinyImage: 'https://www.pathofexile.com/favicon.ico',
        storeUrl: POE_NEWS_URL,
        color: 0xff6b35,
        providerLabel: 'Path of Exile'
    },
    fortnite: {
        aliases: ['fortnite', 'fn', 'battle royale'],
        sourceId: 'fortnite',
        name: 'Fortnite',
        imageUrl: 'https://www.fortnite.com/etc.clientlibs/fortnite/clientlibs/main/resources/images/default-social.jpg',
        tinyImage: 'https://www.fortnite.com/favicon.ico',
        storeUrl: FORTNITE_NEWS_URL,
        color: 0x7c5cff,
        providerLabel: 'Fortnite'
    },
    helldivers2: {
        aliases: ['helldivers2', 'helldivers 2', 'hd2'],
        sourceId: 'helldivers2',
        name: 'Helldivers 2',
        imageUrl: 'https://www.helldivers.com/site-assets/images/social-share.jpg',
        tinyImage: 'https://www.helldivers.com/favicon.ico',
        storeUrl: HELLDIVERS2_NEWS_URL,
        color: 0xffaa00,
        providerLabel: 'Helldivers 2'
    },
    diablo: {
        aliases: ['diablo', 'diablo4', 'diablo iv'],
        sourceId: 'diablo',
        name: 'Diablo IV',
        imageUrl: 'https://diablo4.blizzard.com/en-us/media/diablo4-com-social-share.jpg',
        tinyImage: 'https://diablo4.blizzard.com/favicon.ico',
        storeUrl: DIABLO_NEWS_URL,
        color: 0xaa0000,
        providerLabel: 'Diablo IV'
    },
    overwatch: {
        aliases: ['overwatch', 'ow', 'ow2', 'overwatch2'],
        sourceId: 'overwatch',
        name: 'Overwatch 2',
        imageUrl: 'https://bnetcms-a.akamaihd.net/cms/page_media/p6/BNet_OWW_default_1920x1080.jpg',
        tinyImage: 'https://overwatch.blizzard.com/favicon.ico',
        storeUrl: OVERWATCH_NEWS_URL,
        color: 0xfa9c1e,
        providerLabel: 'Overwatch 2'
    },
    apex: {
        aliases: ['apex', 'apexlegends', 'apex legends'],
        sourceId: 'apex',
        name: 'Apex Legends',
        imageUrl: 'https://media.contentstack.io/v3/assets/bltd34497824181d87f/blt9504a5e07a6c3e9e/63eaab15f3e6236259a15c6f/apex-og-og.jpg',
        tinyImage: 'https://www.ea.com/favicon.ico',
        storeUrl: APEX_NEWS_URL,
        color: 0xcd3333,
        providerLabel: 'Apex Legends'
    },
    cs2: {
        aliases: ['cs2', 'counter-strike', 'csgo', 'cs:go', 'cs go', 'counterstrike'],
        sourceId: 'cs2',
        name: 'Counter-Strike 2',
        imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
        tinyImage: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/730/69f7ebe2735c18a8d24157e54194b7118a080830.jpg',
        storeUrl: 'https://store.steampowered.com/app/730/',
        color: 0xf59e0b,
        providerLabel: 'Counter-Strike 2',
        appId: '730'
    },
    dota2: {
        aliases: ['dota2', 'dota 2', 'dota'],
        sourceId: 'dota2',
        name: 'Dota 2',
        imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/570/header.jpg',
        tinyImage: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/dota2.jpg',
        storeUrl: 'https://store.steampowered.com/app/570/',
        color: 0xaa0000,
        providerLabel: 'Dota 2',
        appId: '570'
    },
    valheim: {
        aliases: ['valheim'],
        sourceId: 'valheim',
        name: 'Valheim',
        imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/892970/header.jpg',
        tinyImage: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/892970/1858e4290b10b0ed3b2aebab25b9c9467b171ea5.jpg',
        storeUrl: 'https://store.steampowered.com/app/892970/',
        color: 0x2e8b57,
        providerLabel: 'Valheim',
        appId: '892970'
    },
    rust: {
        aliases: ['rust'],
        sourceId: 'rust',
        name: 'Rust',
        imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/252490/header.jpg',
        tinyImage: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/252490/693d6ce6e05760932c2fc8b275f37eff21169b7d.jpg',
        storeUrl: 'https://store.steampowered.com/app/252490/',
        color: 0xb5651d,
        providerLabel: 'Rust',
        appId: '252490'
    },
    pubg: {
        aliases: ['pubg', 'pubgnewstate', 'pubg new state'],
        sourceId: 'pubg',
        name: 'PUBG: BATTLEGROUNDS',
        imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/578080/header.jpg',
        tinyImage: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/578080/b78f78c0fd2e56d23a05513187204e9d56d1e572.jpg',
        storeUrl: 'https://store.steampowered.com/app/578080/',
        color: 0xf5a623,
        providerLabel: 'PUBG',
        appId: '578080'
    },
    nvidia: {
        aliases: ['nvidia', 'nvidia drivers', 'geforce', 'nvidia driver', 'nvidia gpu'],
        sourceId: 'nvidia',
        name: 'NVIDIA GPU Drivers',
        imageUrl: 'https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/ada/geforce-ada-40series-og-1200x630.jpg',
        tinyImage: 'https://www.nvidia.com/favicon.ico',
        storeUrl: NVIDIA_BLOG_URL,
        color: 0x76b900,
        providerLabel: 'NVIDIA'
    },
    amd: {
        aliases: ['amd', 'amd drivers', 'radeon', 'amd driver', 'amd gpu', 'amd adrenaline'],
        sourceId: 'amd',
        name: 'AMD GPU Drivers',
        imageUrl: 'https://www.amd.com/system/files/2023-11/AMD-Radeon-Feature-Image.jpg',
        tinyImage: 'https://www.amd.com/favicon.ico',
        storeUrl: AMD_NEWS_URL,
        color: 0xed1c24,
        providerLabel: 'AMD'
    },
    intel: {
        aliases: ['intel', 'intel drivers', 'intel gpu', 'intel arc', 'intel driver'],
        sourceId: 'intel',
        name: 'Intel GPU Drivers',
        imageUrl: 'https://www.intel.com/content/dam/www/central-libraries/us/en/images/intel-arc-a-series-graphics-card.jpg.rendition.intel.web.1648.927.jpg',
        tinyImage: 'https://www.intel.com/favicon.ico',
        storeUrl: INTEL_NEWS_URL,
        color: 0x0071c5,
        providerLabel: 'Intel'
    }
};

function httpsGet(url, { responseType = 'json', headers = {}, redirectCount = 0 } = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: REQUEST_TIMEOUT,
            headers: { ...REQUEST_HEADERS, ...headers }
        }, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectCount >= 5) {
                        return reject(new Error('Too many redirects'));
                    }

                    const nextUrl = new URL(res.headers.location, url).toString();
                    return resolve(httpsGet(nextUrl, { responseType, headers, redirectCount: redirectCount + 1 }));
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
        });

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
            const isTransient = /timeout|timed out|econnreset|socket hang up|etimedout|enotfound/i.test(message);
            if (attempt >= attempts || !isTransient) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt));
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
        [AMP + 'nbsp;', ' '],
        [AMP + 'amp;', AMP],
        [AMP + 'quot;', String.fromCharCode(34)],
        [AMP + '#39;', String.fromCharCode(39)],
        [AMP + 'apos;', String.fromCharCode(39)],
        [AMP + 'lt;', LT],
        [AMP + 'gt;', GT]
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
    const safeImagePath = String(imagePath || '').trim().replace(/^\/+/, '');
    if (!safeClanId || !safeImagePath) return null;

    return `https://clan.akamai.steamstatic.com/images/${safeClanId}/${safeImagePath}`;
}

function extractSteamClanImageUrl(contents) {
    const raw = String(contents || '');
    if (!raw) return null;

    const placeholderMatch = raw.match(/\{STEAM_CLAN_IMAGE\}\/([0-9]+)\/([^\s\]"']+\.(?:jpg|jpeg|png|gif|webp))/i);
    if (placeholderMatch?.[1] && placeholderMatch?.[2]) {
        return buildSteamClanImageUrl(placeholderMatch[1], placeholderMatch[2]);
    }

    const absoluteMatch = raw.match(/https?:\/\/clan\.akamai\.steamstatic\.com\/images\/([0-9]+)\/([^\s\]"']+\.(?:jpg|jpeg|png|gif|webp))/i);
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
        .replace(/https?:\/\/clan\.akamai\.steamstatic\.com\/images\/[0-9]+\/[^\s\]"']+\.(?:jpg|jpeg|png|gif|webp)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatChangelogSummary(article) {
    if (!article) return '';
    
    // Format sections if available (Steam format)
    if (Array.isArray(article.sections) && article.sections.length > 0) {
        const sectionLines = [];
        for (const section of article.sections.slice(0, 3)) {
            const title = String(section.title || 'Updates').trim().toUpperCase();
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
    const timestamp = typeof value === 'number' ? value : Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function buildProviderUpdateKey(provider, { id, url, title, date } = {}) {
    const normalizedProvider = String(provider || 'provider').trim().toLowerCase();
    const normalizedId = String(id || '').trim().toLowerCase();
    const normalizedUrl = String(url || '').trim().toLowerCase();
    const normalizedTitle = truncate(sanitizeText(title || 'update').toLowerCase(), 120);
    const dateMs = toEpochMs(date, 0);

    const parts = [normalizedProvider, normalizedId, normalizedUrl, normalizedTitle];
    if (dateMs > 0) parts.push(String(dateMs));

    return parts.filter(Boolean).join(':');
}

function parseUsDateToIso(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        return null;
    }

    return parsed.toISOString();
}

function normalizeSteamAppId(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const urlMatch = raw.match(/store\.steampowered\.com\/app\/(\d+)/i);
    const normalized = urlMatch ? urlMatch[1] : raw;

    return /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeSpecialSource(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    for (const source of Object.values(SPECIAL_TRACKED_SOURCES)) {
        if (source.aliases.includes(normalized)) {
            return source;
        }
    }

    return null;
}

function extractTrackedEntryValue(entry) {
    if (typeof entry === 'string' || typeof entry === 'number') {
        return String(entry).trim();
    }

    if (!entry || typeof entry !== 'object') {
        return '';
    }

    const specialSource = normalizeSpecialSource(
        entry.sourceId || entry.provider || entry.slug || entry.id || entry.name
    );
    if (specialSource) {
        return specialSource.sourceId;
    }

    const steamCandidate = entry.appId || entry.id || entry.storeUrl || entry.url;
    if (steamCandidate) {
        return String(steamCandidate).trim();
    }

    return String(entry.name || '').trim();
}

function buildStoreUrl(appId) {
    return `https://store.steampowered.com/app/${appId}/`;
}

function buildNewsHubUrl(appId) {
    return `https://store.steampowered.com/news/app/${appId}`;
}

function isBlockedSourceUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /(?:^|\/\/)(?:www\.)?gamingonlinux\.com(?:\/|$)/i.test(url);
}

function isSteamHostedUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
        const host = normalizeComparableHost(new URL(url).hostname);
        return host === 'steampowered.com' || host.endsWith('.steampowered.com');
    } catch {
        return false;
    }
}

function buildSteamArticleUrl(appId, article) {
    // Prefer extracting gid from article.url string — avoids JSON large-integer precision loss
    const rawUrl = String(article?.url || '').trim();
    if (rawUrl && isSteamHostedUrl(rawUrl)) {
        const gidFromUrl = rawUrl.match(/\/view\/(\d+)/)?.[1];
        if (gidFromUrl) return `https://store.steampowered.com/news/app/${appId}/view/${gidFromUrl}`;
    }

    const gid = String(article?.gid || '').trim();
    if (!gid) return null;
    return `https://store.steampowered.com/news/app/${appId}/view/${gid}`;
}

function buildSteamChangelogUrl(appId, article) {
    const articleUrl = String(article?.url || '').trim();

    // Use the article URL directly unless it's an explicitly blocked source (e.g. GamingOnLinux).
    // Steam CDN URLs (steamstore-a.akamaihd.net) redirect correctly to the real article page.
    if (articleUrl && !isBlockedSourceUrl(articleUrl)) {
        return articleUrl;
    }

    return buildSteamArticleUrl(appId, article) || buildNewsHubUrl(appId);
}

function scoreSteamChangelogCandidate(article) {
    if (!article || typeof article !== 'object') return 0;

    const title = sanitizeText(article.title || '').toLowerCase();
    const url = String(article.url || '').toLowerCase();
    const rawContents = String(article.contents || '');
    const cleanedContents = sanitizeText(removeSteamImageMarkup(rawContents)).toLowerCase();
    const text = `${title} ${url} ${cleanedContents}`;
    let score = 0;

    const strongSignals = [
        /\bpatch\s*notes?\b/i,
        /\bchangelog\b/i,
        /\bupdate\s*notes?\b/i,
        /\brelease\s*notes?\b/i,
        /\bhotfix(?:es)?\b/i,
        /\bbug\s*fix(?:es)?\b/i,
        /\bversion\s*(?:\d+\.)+\d+/i
    ];

    const weakSignals = [
        /\bpatch\b/i,
        /\bupdate\b/i,
        /\bfixed\b/i,
        /\bchanges?\b/i,
        /\bimprovements?\b/i,
        /\bbalance\b/i,
        /\bquality\s+of\s+life\b/i,
        /\bserver\s+maintenance\b/i,
        /\bknown\s+issues?\b/i
    ];

    const negativeSignals = [
        /\bsale\b/i,
        /\bdiscount\b/i,
        /\bweekend\s+deal\b/i,
        /\bspotlight\b/i,
        /\btrailer\b/i,
        /\blivestream\b/i,
        /\bstream\b/i,
        /\besports?\b/i,
        /\btournament\b/i,
        /\bgiveaway\b/i,
        /\bcommunity\s+event\b/i,
        /\bfan\s+art\b/i,
        /\bsoundtrack\b/i,
        /\bwallpaper\b/i,
        /\binterview\b/i,
        /\bguide\b/i,
        /\bworkshop\b/i
    ];

    for (const pattern of strongSignals) {
        if (pattern.test(text)) score += 4;
    }

    for (const pattern of weakSignals) {
        if (pattern.test(text)) score += 1;
    }

    for (const pattern of negativeSignals) {
        if (pattern.test(text)) score -= 3;
    }

    const sections = parseSteamSections(removeSteamImageMarkup(rawContents));
    if (sections.length > 0) score += 2;
    const listItemCount = sections.reduce((total, section) => total + (Array.isArray(section.items) ? section.items.length : 0), 0);
    if (listItemCount >= 3) score += 2;

    const titleWordCount = title.split(/\s+/).filter(Boolean).length;
    if (titleWordCount > 0 && titleWordCount <= 2 && !/\bpatch|update|hotfix|notes|changelog\b/i.test(title)) {
        score -= 2;
    }

    return score;
}

function isLikelySteamChangelog(article) {
    return scoreSteamChangelogCandidate(article) >= 3;
}

function buildSourceKey(game) {
    if (!game) return '';
    if (game.provider === 'steam') return `steam:${game.appId}`;
    return game.sourceId || game.provider || '';
}

function buildArticleKey(article) {
    if (!article) return '';
    return String(article.gid || `${article.date || 0}:${article.title || ''}`);
}

/**
 * Normalize any tracked game entry into a standard shape.
 * Uses SPECIAL_TRACKED_SOURCES lookup to avoid per-provider duplication.
 */
function normalizeTrackedGame(game) {
    if (!game) return null;

    const provider = game.provider || game.sourceId || '';
    const source = SPECIAL_TRACKED_SOURCES[provider] || null;

    if (source) {
        return {
            provider: source.sourceId,
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel,
            ...(source.appId ? { appId: source.appId } : {})
        };
    }

    const appId = String(game.appId || game.sourceId || '').trim();
    if (!appId) return null;

    return {
        provider: 'steam',
        appId,
        name: game.name || `App ${appId}`,
        imageUrl: game.imageUrl || game.tinyImage || null,
        tinyImage: game.tinyImage || game.imageUrl || null,
        storeUrl: game.storeUrl || buildStoreUrl(appId),
        color: game.color || 0xf59e0b,
        providerLabel: 'Steam'
    };
}

function parseTrackedSources(input) {
    const rawEntries = Array.isArray(input)
        ? input
        : (input && typeof input === 'object')
            ? [input]
            : String(input || '').split(/[\n,]+/);

    const parts = rawEntries
        .map(extractTrackedEntryValue)
        .flatMap(entry => String(entry || '').split(/[\n,]+/))
        .map(part => part.trim())
        .filter(Boolean);

    const invalidEntries = [];
    const trackedGames = [];
    const seen = new Set();

    for (const entry of parts) {
        const specialSource = normalizeSpecialSource(entry);
        if (specialSource) {
            if (seen.has(specialSource.sourceId)) continue;
            seen.add(specialSource.sourceId);
            trackedGames.push(normalizeTrackedGame({
                provider: specialSource.sourceId,
                sourceId: specialSource.sourceId,
                name: specialSource.name,
                imageUrl: specialSource.imageUrl,
                storeUrl: specialSource.storeUrl
            }));
            continue;
        }

        const appId = normalizeSteamAppId(entry);
        if (!appId) {
            invalidEntries.push(entry);
            continue;
        }

        const sourceKey = `steam:${appId}`;
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        trackedGames.push(normalizeTrackedGame({ provider: 'steam', appId }));
    }

    return {
        trackedGames: trackedGames.slice(0, MAX_TRACKED_GAMES),
        invalidEntries,
        wasTrimmed: trackedGames.length > MAX_TRACKED_GAMES
    };
}

function buildRawGamesValue(input, trackedGames) {
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (trimmed) return trimmed;
    }

    return (Array.isArray(trackedGames) ? trackedGames : [])
        .map(game => game.provider === 'steam' ? game.appId : game.sourceId)
        .filter(Boolean)
        .join('\n');
}

function extractMetaContent(html, key) {
    const patterns = [
        new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i')
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeEntities(match[1]);
    }

    return '';
}

function normalizeComparableHost(value) {
    return String(value || '').toLowerCase().replace(/^www\./, '');
}

function resolveAbsoluteUrl(baseUrl, candidate) {
    try {
        const raw = decodeEntities(String(candidate || '').trim());
        if (!raw || /^#/.test(raw) || /^(javascript|mailto|tel):/i.test(raw)) return null;
        return new URL(raw, baseUrl).toString();
    } catch {
        return null;
    }
}

function extractPreferredArticleUrl(html, baseUrl, {
    hrefPatterns = [],
    textPatterns = [],
    excludePatterns = []
} = {}) {
    const source = String(html || '');
    if (!source) return baseUrl;

    const baseHost = normalizeComparableHost(new URL(baseUrl).hostname);
    const candidates = [];

    const pushCandidate = (url, text = '') => {
        if (!url) return;

        const normalizedText = sanitizeText(text);
        const normalizedUrl = String(url).trim();
        if (!normalizedUrl) return;
        if (isBlockedSourceUrl(normalizedUrl)) return;
        if (excludePatterns.some(pattern => pattern.test(normalizedUrl) || pattern.test(normalizedText))) return;

        let candidateHost = '';
        try {
            candidateHost = normalizeComparableHost(new URL(normalizedUrl).hostname);
        } catch {
            return;
        }

        const isSameHost = candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${candidateHost}`);
        if (!isSameHost) return;

        const key = `${normalizedUrl}::${normalizedText.toLowerCase()}`;
        if (candidates.some(candidate => candidate.key === key)) return;

        let score = 0;
        if (hrefPatterns.some(pattern => pattern.test(normalizedUrl))) score += 5;
        if (textPatterns.some(pattern => pattern.test(normalizedText))) score += 3;
        if (/(patch|notes|update|changelog|release|hotfix)/i.test(`${normalizedUrl} ${normalizedText}`)) score += 1;

        if (score > 0) {
            candidates.push({ key, url: normalizedUrl, score });
        }
    };

    const canonical = extractMetaContent(source, 'og:url') || extractMetaContent(source, 'twitter:url') || '';
    const canonicalUrl = resolveAbsoluteUrl(baseUrl, canonical);
    if (canonicalUrl && canonicalUrl !== baseUrl) {
        pushCandidate(canonicalUrl);
    }

    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
    let match;
    while ((match = anchorRegex.exec(source)) !== null) {
        const resolved = resolveAbsoluteUrl(baseUrl, match[1]);
        pushCandidate(resolved, match[2]);
    }

    candidates.sort((left, right) => right.score - left.score || left.url.length - left.url.length);
    return candidates[0]?.url || baseUrl;
}

function splitIntoHighlights(text, maxItems = 6) {
    const rawSegments = String(text || '')
        .replace(/\r/g, '\n')
        .replace(/[•●·]/g, '\n')
        .split(/\n+/)
        .flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/));

    const seen = new Set();
    const items = [];

    for (const segment of rawSegments) {
        const clean = truncate(sanitizeText(segment), 220);
        if (!clean || clean.length < 16) continue;

        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(clean);

        if (items.length >= maxItems) break;
    }

    return items;
}

function parseSteamSections(contents) {
    const raw = String(contents || '').trim();
    if (!raw) return [];

    const sections = [];
    const sectionRegex = /\[p\]\\?\[\s*([^\]]+?)\s*\\?\]\[\/p\]\s*\[list\]([\s\S]*?)\[\/list\]/gi;
    let sectionMatch;

    while ((sectionMatch = sectionRegex.exec(raw)) !== null) {
        const title = truncate(sanitizeText(sectionMatch[1]), 80);
        const listBody = sectionMatch[2] || '';
        const items = [];
        const itemRegex = /\[\*\]\s*([\s\S]*?)\[\/\*\]/gi;
        let itemMatch;

        while ((itemMatch = itemRegex.exec(listBody)) !== null) {
            const clean = truncate(sanitizeText(itemMatch[1]), 220);
            if (clean) items.push(clean);
        }

        if (title && items.length > 0) {
            sections.push({ title, items });
        }
    }

    if (sections.length > 0) {
        return sections;
    }

    const fallbackItems = String(raw)
        .replace(/\\+/g, '\n')
        .split(/\n+/)
        .map(line => truncate(sanitizeText(line), 220))
        .filter(Boolean)
        .slice(0, 8);

    return fallbackItems.length > 0
        ? [{ title: 'Updates', items: fallbackItems }]
        : [];
}

function formatSectionsAsEmbedText(sections, maxLength = 3000) {
    if (!Array.isArray(sections) || sections.length === 0) {
        return '';
    }

    const blocks = [];

    for (const section of sections.slice(0, 5)) {
        const rawTitle = String(section?.title || '').trim();
        const title = truncate(rawTitle || 'Updates', 60).toUpperCase();
        const items = Array.isArray(section?.items)
            ? section.items
                .map(item => truncate(sanitizeText(item), 220))
                .filter(Boolean)
                .slice(0, 8)
            : [];

        if (!items.length) continue;

        const lines = [`[ ${title} ]`, '', ...items.map(item => `•  ${item}`)];
        blocks.push(lines.join('\n'));
    }

    return truncate(blocks.join('\n\n'), maxLength);
}

/**
 * Build a rich Discord embed for a game update notification.
 * Uses embed fields for better visual structure with a clean, light appearance.
 */
function createUpdateEmbed(update) {
    const isValidUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    };
    
    // Use a lighter color scheme: default to a clean light blue/white tone
    const embedColor = update.color || 0x5865f2;
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
            name: truncate(update.gameName || update.providerLabel || 'Game Update', 256),
            iconURL: update.tinyImage || undefined
        })
        .setTitle(truncate(update.title || 'Game update', 256))
        .setFooter({ text: `${update.providerLabel || 'Game'} • Update Alert` })
        .setTimestamp(toDateObject(update.date, Date.now()));

    // Build a concise description with summary + link
    const summary = truncate(sanitizeText(update.summary || ''), 700);
    const descriptionParts = [];

    if (summary) {
        descriptionParts.push(summary);
    }

    if (isValidUrl(update.url)) {
        descriptionParts.push(`🔗 [View full patch notes](${update.url})`);
    }

    if (descriptionParts.length > 0) {
        embed.setDescription(truncate(descriptionParts.join('\n\n'), 4096));
    }

    // Add each changelog section as a separate embed field for better readability
    if (Array.isArray(update.sections) && update.sections.length > 0) {
        for (const section of update.sections.slice(0, 5)) {
            const rawTitle = String(section?.title || '').trim();
            const title = truncate(rawTitle || 'Updates', 60).toUpperCase();
            const items = Array.isArray(section?.items)
                ? section.items
                    .map(item => truncate(sanitizeText(item), 220))
                    .filter(Boolean)
                    .slice(0, 8)
                : [];

            if (!items.length) continue;

            const fieldValue = items.map(item => `• ${item}`).join('\n');
            embed.addFields({ name: title, value: truncate(fieldValue, 1024), inline: false });
        }
    }

    // Add metadata fields in a compact inline row
    if (update.version) {
        embed.addFields({ name: 'Version', value: truncate(update.version, 100), inline: true });
    }

    if (update.date) {
        const ts = toUnixTimestamp(update.date);
        if (ts) {
            embed.addFields({ name: 'Released', value: `<t:${ts}:R>`, inline: true });
        }
    }

    if (update.storeUrl && isValidUrl(update.storeUrl) && update.storeUrl !== update.url) {
        embed.addFields({ name: 'Store', value: `[View on Store](${update.storeUrl})`, inline: true });
    }

    const thumbnailUrl = update.tinyImage || update.imageUrl || null;
    const bannerUrl = update.bannerUrl || update.imageUrl || null;

    // Show both a compact logo and a large banner when available.
    if (isValidUrl(thumbnailUrl)) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (isValidUrl(bannerUrl)) {
        embed.setImage(bannerUrl);
    }

    return embed;
}

function buildSteamUpdate(appId, article, game) {
    const title = sanitizeText(article.title) || `Update posted for ${game?.name || `App ${appId}`}`;
    const rawContents = String(article.contents || '');
    const cleanedContents = removeSteamImageMarkup(rawContents);
    const sections = parseSteamSections(cleanedContents);
    const firstSectionItem = sections[0]?.items?.[0] || '';
    const fallbackSummary = sanitizeText(cleanedContents.replace(/\\+/g, ' ')).trim();
    const summary = truncate(firstSectionItem || fallbackSummary || 'A new Steam changelog is now live.', 280);
    const articleImage = extractSteamClanImageUrl(rawContents);

    // Try to extract version from title
    const versionMatch = title.match(/(?:v?(\d+(?:\.\d+){1,3}))/);

    return {
        key: buildArticleKey(article),
        provider: 'steam',
        providerLabel: 'Steam',
        gameName: game?.name || `App ${appId}`,
        title,
        summary,
        sections,
        version: versionMatch?.[1] || null,
        url: buildSteamChangelogUrl(appId, article),
        date: Number(article.date) || 0,
        imageUrl: game?.imageUrl || articleImage || null,
        tinyImage: game?.tinyImage || null,
        bannerUrl: articleImage || game?.imageUrl || null,
        color: game?.color || 0xf59e0b,
        storeUrl: game?.storeUrl || buildStoreUrl(appId)
    };
}

function looksLikeMinecraftUpdate(title) {
    return /(changelog|snapshot|preview|release candidate|java edition\s+\d|bedrock|preview changelog|release notes)/i.test(title);
}

function extractMinecraftCandidates(html) {
    const candidates = [];
    const seen = new Set();
    const anchorRegex = /<a[^>]+href="(\/en-us\/article\/[^"]+)"[^>]*>(.*?)<\/a>/gis;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
        const href = decodeEntities(match[1]);
        const title = sanitizeText(match[2]);
        if (!href || !title || seen.has(href)) continue;
        if (!looksLikeMinecraftUpdate(title)) continue;

        const nearbyText = sanitizeText(html.slice(match.index, match.index + 500))
            .replace(title, '')
            .trim();
        const summary = truncate(nearbyText.replace(/\b\d+\s+days?\s+ago\b/i, '').trim(), 220);

        seen.add(href);
        candidates.push({
            url: `https://www.minecraft.net${href}`,
            title,
            summary
        });
    }

    return candidates.slice(0, 3);
}

async function fetchMinecraftUpdates() {
    const manifest = await httpsGetJson(MINECRAFT_VERSION_MANIFEST_URL);
    const latestRelease = manifest?.latest?.release;
    const latestSnapshot = manifest?.latest?.snapshot;
    const versions = Array.isArray(manifest?.versions) ? manifest.versions : [];
    const releaseEntry = versions.find(version => version.id === latestRelease);
    const snapshotEntry = versions.find(version => version.id === latestSnapshot);

    return [{
        key: `minecraft:${latestRelease || 'unknown'}:${latestSnapshot || 'unknown'}`,
        provider: 'minecraft',
        providerLabel: 'Minecraft',
        gameName: 'Minecraft',
        title: `Minecraft Java Edition ${latestRelease || 'Update'}`,
        summary: latestRelease
            ? `Latest release ${latestRelease} is live${latestSnapshot && latestSnapshot !== latestRelease ? `, and snapshot ${latestSnapshot} is currently available.` : '.'}`
            : 'A new Minecraft Java Edition version is available.',
        sections: [
            {
                title: 'Java Edition',
                items: [
                    latestRelease ? `Release: ${latestRelease}` : null,
                    latestSnapshot ? `Snapshot: ${latestSnapshot}` : null,
                    releaseEntry?.releaseTime ? `Release published: ${new Date(releaseEntry.releaseTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : null,
                    snapshotEntry?.releaseTime && latestSnapshot !== latestRelease ? `Snapshot published: ${new Date(snapshotEntry.releaseTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : null
                ].filter(Boolean)
            }
        ],
        version: latestRelease || null,
        url: MINECRAFT_UPDATES_URL,
        date: releaseEntry?.releaseTime || snapshotEntry?.releaseTime || Date.now(),
        imageUrl: SPECIAL_TRACKED_SOURCES.minecraft.imageUrl,
        tinyImage: SPECIAL_TRACKED_SOURCES.minecraft.tinyImage,
        color: SPECIAL_TRACKED_SOURCES.minecraft.color,
        storeUrl: MINECRAFT_UPDATES_URL
    }];
}

function parseLeaguePatchVersion(url) {
    const match = String(url || '').match(/patch-(\d+)-(\d+)-notes/i);
    if (!match) return null;

    return {
        major: Number(match[1]) || 0,
        minor: Number(match[2]) || 0
    };
}

function extractLeaguePatchUrl(html) {
    const matches = Array.from(new Set([
        ...String(html || '').match(/\/en-us\/news\/game-updates\/[a-z0-9-]*patch-\d+-\d+-notes\/?/gi) || [],
        ...String(html || '').match(/\/en-us\/news\/game-updates\/patch-\d+-\d+-notes\/?/gi) || []
    ]));

    const ranked = matches
        .map(url => ({ url, version: parseLeaguePatchVersion(url) }))
        .filter(entry => entry.version)
        .sort((left, right) => (right.version.major - left.version.major) || (right.version.minor - left.version.minor));

    return ranked[0]?.url ? `https://www.leagueoflegends.com${ranked[0].url}` : LEAGUE_PATCH_NOTES_URL;
}

function extractLeaguePublishedAt(html) {
    const metaPublished = extractMetaContent(html, 'article:published_time');
    if (metaPublished) return metaPublished;

    const textMatch = String(html || '').match(/Game Updates\s*\|[^|]*\|(\d{1,2}\/\d{1,2}\/\d{4})/i);
    return textMatch?.[1] ? parseUsDateToIso(textMatch[1]) : null;
}

function extractLeagueSections(html) {
    const headings = Array.from(String(html || '').matchAll(/<h2[^>]*>(.*?)<\/h2>/gis))
        .map(match => sanitizeText(match[1]))
        .filter(Boolean)
        .filter(title => !/related articles|about league of legends/i.test(title));

    return headings.slice(0, 5).map(title => ({ title, items: [`See the official ${title.toLowerCase()} section in the latest patch notes.`] }));
}

async function fetchLeagueUpdates() {
    const listingHtml = await httpsGetText(LEAGUE_PATCH_NOTES_URL);
    const patchUrl = extractLeaguePatchUrl(listingHtml);
    const patchHtml = patchUrl === LEAGUE_PATCH_NOTES_URL ? listingHtml : await httpsGetText(patchUrl);
    const title = extractMetaContent(patchHtml, 'og:title') || 'League of Legends Patch Notes';
    const summary = truncate(
        extractMetaContent(patchHtml, 'og:description') || 'A new League of Legends patch is live.',
        280
    );
    const imageUrl = extractMetaContent(patchHtml, 'og:image') || SPECIAL_TRACKED_SOURCES.league.imageUrl;

    // Try to extract patch version from URL
    const versionParts = parseLeaguePatchVersion(patchUrl);
    const version = versionParts ? `${versionParts.major}.${versionParts.minor}` : null;

    return [{
        key: patchUrl,
        provider: 'league',
        providerLabel: 'League of Legends',
        gameName: 'League of Legends',
        title,
        summary,
        sections: extractLeagueSections(patchHtml),
        version,
        url: patchUrl,
        date: extractLeaguePublishedAt(patchHtml) || Date.now(),
        imageUrl,
        tinyImage: SPECIAL_TRACKED_SOURCES.league.tinyImage,
        color: SPECIAL_TRACKED_SOURCES.league.color,
        storeUrl: LEAGUE_PATCH_NOTES_URL
    }];
}

function buildOsuSections(entries) {
    const grouped = new Map();

    for (const entry of entries || []) {
        const category = sanitizeText(entry.category) || 'Highlights';
        if (!grouped.has(category)) {
            grouped.set(category, []);
        }

        const items = grouped.get(category);
        if (items.length < 5) {
            items.push(truncate(sanitizeText(entry.title), 220));
        }
    }

    return Array.from(grouped.entries())
        .map(([title, items]) => ({ title, items }))
        .filter(section => section.items.length > 0)
        .slice(0, 4);
}

function buildOsuSummary(build) {
    const entries = Array.isArray(build?.changelog_entries) ? build.changelog_entries : [];
    const majorEntries = entries.filter(entry => entry.major).slice(0, 2);
    const summarySource = majorEntries[0]?.message_html || majorEntries[0]?.title || entries[0]?.title;
    if (summarySource) {
        return truncate(sanitizeText(summarySource), 280);
    }

    return `A new osu! ${build?.update_stream?.display_name || 'lazer'} build is now live.`;
}

async function fetchOsuUpdates() {
    const build = await httpsGetJson(OSU_CHANGELOG_API_URL);
    const sections = buildOsuSections(build.changelog_entries);
    const imageUrl = build.youtube_id
        ? `https://i.ytimg.com/vi/${encodeURIComponent(build.youtube_id)}/hqdefault.jpg`
        : SPECIAL_TRACKED_SOURCES.osu.imageUrl;

    return [{
        key: `osu:${build.id || build.version}`,
        provider: 'osu',
        providerLabel: 'osu!',
        gameName: 'osu!',
        title: `${build.update_stream?.display_name || 'Lazer'} ${build.display_version || build.version}`,
        summary: buildOsuSummary(build),
        sections,
        version: build.display_version || build.version || null,
        url: `${OSU_CHANGELOG_URL}/${encodeURIComponent(build.version || build.display_version || '')}`,
        date: build.created_at || Date.now(),
        imageUrl,
        tinyImage: SPECIAL_TRACKED_SOURCES.osu.tinyImage,
        color: SPECIAL_TRACKED_SOURCES.osu.color,
        storeUrl: OSU_CHANGELOG_URL
    }];
}

/**
 * Generic HTML-based update fetcher for non-Steam sources.
 * Extracts title, summary, changelog URL, and published date from a news page.
 */
function createGenericWebFetcher({ providerKey, pageUrl, urlPatterns = {}, textPatterns = [], excludePatterns = [] }) {
    return async function fetchGenericUpdates() {
        try {
            const html = await httpsGetText(pageUrl);
            const source = SPECIAL_TRACKED_SOURCES[providerKey];

            const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
            const title = titleMatch ? sanitizeText(titleMatch[1]) : `${source?.name || providerKey} Update`;
            const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<p[^>]*>(.*?)<\/p>/i);
            const summary = truncate(
                descMatch ? sanitizeText(descMatch[1]) : `New ${source?.name || providerKey} updates and news.`,
                280
            );

            const changelogUrl = extractPreferredArticleUrl(html, pageUrl, {
                hrefPatterns: urlPatterns.href || [/\/news\//i, /patch/i, /notes/i, /update/i, /changelog/i],
                textPatterns: urlPatterns.text || textPatterns.length > 0 ? textPatterns : [/patch/i, /notes/i, /changelog/i, /update/i, /hotfix/i],
                excludePatterns: urlPatterns.exclude || excludePatterns.length > 0 ? excludePatterns : [/shop|account|support|privacy|terms|store|buy/i]
            });

            const publishedAt = extractMetaContent(html, 'article:published_time') || extractMetaContent(html, 'og:updated_time') || null;

            // Try to extract version from title
            const versionMatch = title.match(/(?:v?(\d+(?:\.\d+){1,3}))/);

            return [{
                key: buildProviderUpdateKey(providerKey, { url: changelogUrl, title, date: publishedAt }),
                provider: providerKey,
                providerLabel: source?.providerLabel || providerKey,
                gameName: source?.name || providerKey,
                title,
                summary,
                sections: [],
                version: versionMatch?.[1] || null,
                url: changelogUrl,
                date: publishedAt || Date.now(),
                imageUrl: source?.imageUrl || null,
                tinyImage: source?.tinyImage || null,
                color: source?.color || 0xf59e0b,
                storeUrl: source?.storeUrl || pageUrl
            }];
        } catch (error) {
            console.error(`Error fetching ${providerKey} updates:`, error);
            return [];
        }
    };
}

// Individual fetchers using the generic factory where possible
async function fetchValorantUpdates() {
    return createGenericWebFetcher({
        providerKey: 'valorant',
        pageUrl: VALORANT_PATCH_NOTES_URL,
        urlPatterns: {
            href: [/\/news\/game-updates\//i, /patch/i, /notes/i],
            text: [/patch/i, /notes/i, /update/i, /changelog/i],
            exclude: [/\/esports\//i, /\/dev\//i, /privacy|terms|support/i]
        }
    })();
}

async function fetchFFXIVUpdates() {
    return createGenericWebFetcher({
        providerKey: 'ffxiv',
        pageUrl: FFXIV_PATCH_NOTES_URL,
        urlPatterns: {
            href: [/\/lodestone\/topics\/detail\//i, /patch/i, /notes/i],
            text: [/patch/i, /notes/i, /maintenance/i, /update/i],
            exclude: [/privacy|terms|support|account/i]
        }
    })();
}

async function fetchWoWUpdates() {
    return createGenericWebFetcher({
        providerKey: 'wow',
        pageUrl: WOW_PATCH_NOTES_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /hotfix/i],
            text: [/patch/i, /notes/i, /hotfix/i, /update/i],
            exclude: [/shop|account|support|privacy|terms/i]
        }
    })();
}

async function fetchPoEUpdates() {
    return createGenericWebFetcher({
        providerKey: 'poe',
        pageUrl: POE_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /changelog/i],
            text: [/patch/i, /notes/i, /changelog/i, /update/i],
            exclude: [/forum|account|support|privacy|terms/i]
        }
    })();
}

async function fetchFortniteUpdates() {
    return createGenericWebFetcher({
        providerKey: 'fortnite',
        pageUrl: FORTNITE_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /changelog/i],
            text: [/patch/i, /notes/i, /changelog/i, /update/i],
            exclude: [/creative|festival|shop|support|privacy|terms/i]
        }
    })();
}

async function fetchHelldivers2Updates() {
    return createGenericWebFetcher({
        providerKey: 'helldivers2',
        pageUrl: HELLDIVERS2_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /update/i],
            text: [/patch/i, /notes/i, /changelog/i, /update/i],
            exclude: [/store|buy|support|privacy|terms/i]
        }
    })();
}

async function fetchDiabloUpdates() {
    return createGenericWebFetcher({
        providerKey: 'diablo',
        pageUrl: DIABLO_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /update/i],
            text: [/patch/i, /notes/i, /hotfix/i, /update/i],
            exclude: [/shop|account|support|privacy|terms/i]
        }
    })();
}

async function fetchOverwatchUpdates() {
    return createGenericWebFetcher({
        providerKey: 'overwatch',
        pageUrl: OVERWATCH_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /update/i],
            text: [/patch/i, /notes/i, /update/i, /hero/i],
            exclude: [/shop|account|support|privacy|terms|esports/i]
        }
    })();
}

async function fetchApexUpdates() {
    return createGenericWebFetcher({
        providerKey: 'apex',
        pageUrl: APEX_NEWS_URL,
        urlPatterns: {
            href: [/\/news\//i, /patch/i, /notes/i, /update/i],
            text: [/patch/i, /notes/i, /update/i, /season/i],
            exclude: [/shop|account|support|privacy|terms/i]
        }
    })();
}

/**
 * Extract driver version numbers from text (e.g. "555.85", "v32.0.101.5768").
 */
function extractDriverVersion(text) {
    const cleaned = sanitizeText(String(text || ''));
    // Match patterns like "555.85", "v32.0.101.5768", "Radeon Software 24.5.1"
    const match = cleaned.match(/(?:v(?:ersion)?\s*)?(\d{1,3}\.\d{1,3}(?:\.\d{1,5}){0,2})/i);
    return match?.[1] || null;
}

/**
 * Fetch latest NVIDIA GPU driver updates from the GeForce news/blog page.
 */
async function fetchNvidiaUpdates() {
    try {
        const html = await httpsGetText(NVIDIA_BLOG_URL);
        const source = SPECIAL_TRACKED_SOURCES.nvidia;

        // Look for driver-related articles in the blog listing
        const driverPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gis;
        const candidates = [];
        const seen = new Set();
        let match;

        while ((match = driverPattern.exec(html)) !== null) {
            const href = decodeEntities(match[1]);
            const text = sanitizeText(match[2]);
            const combined = `${href} ${text}`.toLowerCase();

            if (!href || seen.has(href)) continue;
            if (!/driver|geforce|game\s*ready|hotfix|studio/i.test(combined)) continue;
            if (/\/zh-tw\//i.test(href)) continue;

            const resolvedUrl = resolveAbsoluteUrl(NVIDIA_BLOG_URL, href);
            if (!resolvedUrl) continue;

            seen.add(href);
            candidates.push({
                url: resolvedUrl,
                title: text.trim().slice(0, 200),
                score: 0
            });
        }

        // Also look for version patterns in page text
        const versionBlocks = html.match(/(?:GeForce|Game Ready|Studio)\s+Driver\s+v?(\d+\.\d+)/gi) || [];
        const latestVersion = extractDriverVersion(versionBlocks[0]) || null;

        // Prefer article links with driver content
        let bestCandidate = null;
        const articleUrl = extractPreferredArticleUrl(html, NVIDIA_BLOG_URL, {
            hrefPatterns: [/\/geforce\/news\//i, /driver/i, /game-ready/i, /hotfix/i, /studio/i],
            textPatterns: [/driver/i, /game.ready/i, /hotfix/i, /geforce/i],
            excludePatterns: [/forum|account|support|privacy|terms|download\/center/i]
        });

        if (articleUrl && articleUrl !== NVIDIA_BLOG_URL) {
            bestCandidate = { url: articleUrl, title: '' };
        } else if (candidates.length > 0) {
            bestCandidate = candidates[0];
        }

        const title = bestCandidate?.title || (latestVersion ? `NVIDIA GeForce Driver ${latestVersion} Available` : 'NVIDIA GeForce Driver Update');
        const publishedAt = extractMetaContent(html, 'article:published_time') || extractMetaContent(html, 'og:updated_time') || null;

        return [{
            key: buildProviderUpdateKey('nvidia', { url: bestCandidate?.url || NVIDIA_BLOG_URL, title, date: publishedAt }),
            provider: 'nvidia',
            providerLabel: 'NVIDIA',
            gameName: source.name,
            title: truncate(title, 256),
            summary: latestVersion
                ? `NVIDIA GeForce Game Ready Driver version ${latestVersion} is now available. Check the release notes for supported GPUs and fixes.`
                : 'A new NVIDIA GeForce driver update is available. Check the release notes for supported GPUs and fixes.',
            sections: latestVersion ? [{ title: 'Driver Info', items: [`Version: ${latestVersion}`] }] : [],
            version: latestVersion,
            url: bestCandidate?.url || NVIDIA_DRIVERS_URL,
            date: publishedAt || Date.now(),
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage,
            color: source.color,
            storeUrl: NVIDIA_DRIVERS_URL
        }];
    } catch (error) {
        console.error('Error fetching NVIDIA driver updates:', error);
        return [];
    }
}

/**
 * Fetch latest AMD GPU driver updates from the AMD drivers page.
 */
async function fetchAmdUpdates() {
    try {
        let html;
        try {
            html = await httpsGetTextWithRetry(AMD_DRIVERS_URL, { timeout: DRIVER_FETCH_TIMEOUT_MS });
        } catch {
            // Fallback to AMD news page if release notes page times out
            html = await httpsGetTextWithRetry(AMD_NEWS_URL, { timeout: DRIVER_FETCH_TIMEOUT_MS });
        }
        const source = SPECIAL_TRACKED_SOURCES.amd;

        // Extract version from the driver release notes page
        const versionMatch = html.match(/(?:Adrenalin|Radeon|AMD)\s+(?:Software\s+)?(?:Edition\s+)?(?:WHQL\s+)?v?(\d{2}\.\d{1,2}\.\d{1,2})/i);
        const version = versionMatch?.[1] || extractDriverVersion(html) || null;

        const title = extractMetaContent(html, 'og:title') || (version ? `AMD Radeon Software Adrenalin ${version}` : 'AMD Radeon Driver Update');
        const summary = truncate(
            extractMetaContent(html, 'og:description') || (version
                ? `AMD Radeon Software Adrenalin Edition version ${version} is now available. This update includes optimizations, bug fixes, and support for the latest titles.`
                : 'A new AMD Radeon driver update is available. Check the release notes for supported hardware and fixes.'),
            280
        );
        const imageUrl = extractMetaContent(html, 'og:image') || source.imageUrl;

        const changelogUrl = extractPreferredArticleUrl(html, AMD_DRIVERS_URL, {
            hrefPatterns: [/\/release-notes\//i, /driver/i, /adrenalin/i],
            textPatterns: [/release/i, /driver/i, /adrenalin/i],
            excludePatterns: [/shop|buy|account|support|privacy|terms/i]
        });

        const publishedAt = extractMetaContent(html, 'article:published_time') || extractMetaContent(html, 'og:updated_time') || null;

        return [{
            key: buildProviderUpdateKey('amd', { url: changelogUrl, title, date: publishedAt }),
            provider: 'amd',
            providerLabel: 'AMD',
            gameName: source.name,
            title: truncate(title, 256),
            summary,
            sections: version ? [{ title: 'Driver Info', items: [`Version: ${version}`, 'AMD Radeon Software Adrenalin Edition'] }] : [],
            version,
            url: changelogUrl,
            date: publishedAt || Date.now(),
            imageUrl,
            tinyImage: source.tinyImage,
            color: source.color,
            storeUrl: AMD_DRIVERS_URL
        }];
    } catch (error) {
        console.error('Error fetching AMD driver updates:', error.message || error);
        throw error; // Re-throw so circuit breaker in fetchUpdatesForGame can set cooldown
    }
}

/**
 * Fetch latest Intel GPU driver updates from the Intel newsroom page.
 */
async function fetchIntelUpdates() {
    try {
        const html = await httpsGetText(INTEL_NEWS_URL);
        const source = SPECIAL_TRACKED_SOURCES.intel;

        // Look for graphics driver related news
        const articleUrl = extractPreferredArticleUrl(html, INTEL_NEWS_URL, {
            hrefPatterns: [/\/news\//i, /graphics/i, /driver/i, /arc/i, /gpu/i],
            textPatterns: [/driver/i, /graphics/i, /arc/i, /gpu/i, /xe/i],
            excludePatterns: [/shop|buy|account|support|privacy|terms|career/i]
        });

        // Try to find version info on the driver download page
        let version = null;
        try {
            const driverHtml = await httpsGetText(INTEL_DRIVERS_URL);
            const versionMatch = driverHtml.match(/(\d{2,4}\.\d{1,4}\.\d{1,5}\.\d{1,5})/);
            version = versionMatch?.[1] || null;
        } catch {
            // Driver page may not be accessible, that's okay
        }

        const title = extractMetaContent(html, 'og:title') || (version ? `Intel Graphics Driver ${version}` : 'Intel GPU Driver Update');
        const publishedAt = extractMetaContent(html, 'article:published_time') || extractMetaContent(html, 'og:updated_time') || null;

        return [{
            key: buildProviderUpdateKey('intel', { url: articleUrl || INTEL_NEWS_URL, title, date: publishedAt }),
            provider: 'intel',
            providerLabel: 'Intel',
            gameName: source.name,
            title: truncate(title, 256),
            summary: version
                ? `Intel Graphics Driver version ${version} is now available with performance optimizations and bug fixes for Intel Arc and Intel Xe GPUs.`
                : 'A new Intel GPU driver update is available. Check the release notes for supported hardware and game optimizations.',
            sections: version ? [{ title: 'Driver Info', items: [`Version: ${version}`, 'Intel Arc / Intel Xe Graphics'] }] : [],
            version,
            url: articleUrl || INTEL_DRIVERS_URL,
            date: publishedAt || Date.now(),
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage,
            color: source.color,
            storeUrl: INTEL_DRIVERS_URL
        }];
    } catch (error) {
        console.error('Error fetching Intel driver updates:', error);
        return [];
    }
}

/**
 * Lookup table for special provider update fetchers.
 * Replaces the long if-else chain in fetchUpdatesForGame.
 */
const SPECIAL_PROVIDER_FETCHERS = {
    minecraft: fetchMinecraftUpdates,
    league: fetchLeagueUpdates,
    osu: fetchOsuUpdates,
    valorant: fetchValorantUpdates,
    ffxiv: fetchFFXIVUpdates,
    wow: fetchWoWUpdates,
    poe: fetchPoEUpdates,
    fortnite: fetchFortniteUpdates,
    helldivers2: fetchHelldivers2Updates,
    diablo: fetchDiabloUpdates,
    overwatch: fetchOverwatchUpdates,
    apex: fetchApexUpdates,
    nvidia: fetchNvidiaUpdates,
    amd: fetchAmdUpdates,
    intel: fetchIntelUpdates
};

class SteamGameUpdatesManager {
    constructor() {
        this.client = null;
        this.interval = null;
        this.data = { guilds: {} };
        this.pollInFlight = false;
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
                console.error('Error loading Steam game updates config:', error);
            }
        }

        for (const guildId of Object.keys(this.data.guilds || {})) {
            const config = this.data.guilds[guildId];
            config.trackedGames = Array.isArray(config?.trackedGames)
                ? config.trackedGames.map(normalizeTrackedGame).filter(Boolean)
                : [];
            config.appIds = config.trackedGames.filter(game => game.provider === 'steam').map(game => game.appId);
            if (typeof config.enabled !== 'boolean') {
                config.enabled = Boolean(config.channelId);
            }
            if (!config.lastSeenArticles || typeof config.lastSeenArticles !== 'object') {
                config.lastSeenArticles = {};
            }
        }

        this.startPolling();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    getGuildConfig(guildId) {
        const config = this.data.guilds[guildId] || null;
        if (!config) return null;

        if (!Array.isArray(config.trackedGames)) {
            config.trackedGames = [];
        }

        config.trackedGames = config.trackedGames.map(normalizeTrackedGame).filter(Boolean);
        config.appIds = config.trackedGames.filter(game => game.provider === 'steam').map(game => game.appId);
        config.enabled = typeof config.enabled === 'boolean' ? config.enabled : Boolean(config.channelId);

        // Always recompute rawGames so it includes all sources (including special ones like osu, minecraft, lol)
        config.rawGames = buildRawGamesValue(config.rawGames, config.trackedGames);

        return config;
    }

    isFeatureEnabled(guildId) {
        const settings = settingsManager.get(guildId);
        return settings.features?.steamGameUpdates !== false;
    }

    async fetchGameDetails(appId) {
        const payload = await httpsGetJson(`${APP_DETAILS_URL}${encodeURIComponent(appId)}`);
        const result = payload?.[appId];
        if (!result?.success || !result.data) {
            throw new Error(`Steam app ${appId} was not found`);
        }

        return normalizeTrackedGame({
            provider: 'steam',
            appId: String(appId),
            name: result.data.name || `App ${appId}`,
            imageUrl: result.data.header_image || null,
            tinyImage: result.data.capsule_image || result.data.header_image || null,
            storeUrl: buildStoreUrl(appId)
        });
    }

    async searchStoreGames(query) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery || normalizedQuery.length < 2) {
            return [];
        }

        const exactAppId = normalizeSteamAppId(normalizedQuery);
        const results = [];
        const seen = new Set();

        if (exactAppId) {
            const exactMatch = await this.fetchGameDetails(exactAppId).catch(() => null);
            if (exactMatch) {
                results.push(exactMatch);
                seen.add(exactMatch.appId);
            }
        }

        const payload = await httpsGetJson(`${APP_SEARCH_URL}${encodeURIComponent(normalizedQuery)}`);
        const items = Array.isArray(payload?.items) ? payload.items : [];

        for (const item of items) {
            const appId = normalizeSteamAppId(item.id);
            if (!appId || seen.has(appId)) continue;
            seen.add(appId);
            results.push(normalizeTrackedGame({
                provider: 'steam',
                appId,
                name: item.name || `App ${appId}`,
                imageUrl: item.large_capsule_image || item.tiny_image || null,
                tinyImage: item.tiny_image || item.large_capsule_image || null,
                storeUrl: buildStoreUrl(appId)
            }));
            if (results.length >= 8) break;
        }

        return results;
    }

    async fetchNewsForApp(appId, game) {
        const payload = await httpsGetJson(`${APP_NEWS_URL}${encodeURIComponent(appId)}`);
        const items = Array.isArray(payload?.appnews?.newsitems) ? payload.appnews.newsitems : [];
        const rankedItems = items
            .map(article => ({ article, score: scoreSteamChangelogCandidate(article) }))
            .sort((left, right) => {
                if (right.score !== left.score) return right.score - left.score;
                return Number(right.article?.date || 0) - Number(left.article?.date || 0);
            });

        const likelyChangelogs = rankedItems
            .filter(entry => isLikelySteamChangelog(entry.article))
            .map(entry => entry.article);

        const preferredItems = likelyChangelogs.length > 0
            ? likelyChangelogs
            : rankedItems.map(entry => entry.article);

        return preferredItems
            .map(article => buildSteamUpdate(appId, article, game))
            .filter(article => article.key)
            .sort((left, right) => Number(right.date) - Number(left.date));
    }

    /**
     * Fetch updates for any tracked game using the provider lookup table.
     */
    async fetchUpdatesForGame(game) {
        if (!game) return [];

        const fetcher = SPECIAL_PROVIDER_FETCHERS[game.provider];
        if (fetcher) {
            const providerKey = game.provider || game.sourceId;
            const lastFail = providerFailCooldowns.get(providerKey) || 0;
            if (lastFail > 0 && (Date.now() - lastFail) < PROVIDER_FAIL_COOLDOWN_MS) {
                // Provider is in cooldown due to persistent failures; skip silently
                return [];
            }

            // Deduplicate concurrent fetches for the same provider
            if (providerOngoingFetches.has(providerKey)) {
                return providerOngoingFetches.get(providerKey);
            }

            const fetchPromise = (async () => {
                try {
                    const result = await fetcher();
                    providerFailCooldowns.delete(providerKey);
                    return result;
                } catch (error) {
                    providerFailCooldowns.set(providerKey, Date.now());
                    throw error;
                } finally {
                    providerOngoingFetches.delete(providerKey);
                }
            })();

            providerOngoingFetches.set(providerKey, fetchPromise);
            return fetchPromise;
        }

        // Steam games with known appId in SPECIAL_TRACKED_SOURCES (cs2, dota2, etc.)
        if (game.appId) {
            return this.fetchNewsForApp(game.appId, game);
        }

        return [];
    }

    async resolveTrackedGames(rawGames) {
        const { trackedGames, invalidEntries, wasTrimmed } = parseTrackedSources(rawGames);

        if (invalidEntries.length > 0) {
            throw new Error(`Invalid game identifiers: ${invalidEntries.slice(0, 5).join(', ')}`);
        }

        if (trackedGames.length === 0) {
            throw new Error('Add at least one Steam app ID, `minecraft`, `osu`, or `lol`');
        }

        const resolvedGames = [];
        for (const game of trackedGames) {
            if (game.provider === 'steam') {
                resolvedGames.push(await this.fetchGameDetails(game.appId));
            } else {
                resolvedGames.push(normalizeTrackedGame(game));
            }
        }

        return {
            trackedGames: resolvedGames,
            wasTrimmed
        };
    }

    async buildPreview(appIds, trackedGames) {
        const previews = [];

        for (const game of trackedGames) {
            const articles = await this.fetchUpdatesForGame(game).catch(() => []);
            const latestArticle = articles[0] || null;
            previews.push({
                ...game,
                latestArticle,
                formattedSummary: latestArticle ? formatChangelogSummary(latestArticle) : ''
            });
        }

        return previews.sort((left, right) => left.name.localeCompare(right.name));
    }

    async updateGuildConfig(guildId, channelId, rawGames, options = {}) {
        const { trackedGames, wasTrimmed } = await this.resolveTrackedGames(rawGames);
        const lastSeenArticles = {};
        const enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;

        for (const game of trackedGames) {
            const articles = await this.fetchUpdatesForGame(game).catch(() => []);
            lastSeenArticles[buildSourceKey(game)] = articles[0]?.key || '';
        }

        const appIds = trackedGames.filter(game => game.provider === 'steam').map(game => game.appId);

        this.data.guilds[guildId] = {
            enabled,
            channelId,
            appIds,
            trackedGames,
            rawGames: buildRawGamesValue(rawGames, trackedGames),
            lastSeenArticles,
            lastCheckedAt: new Date().toISOString()
        };

        await this.save();

        return {
            config: this.getGuildConfig(guildId),
            trackedGames,
            wasTrimmed,
            previews: await this.buildPreview(appIds, trackedGames)
        };
    }

    async disableAlerts(guildId) {
        delete this.data.guilds[guildId];
        await this.save();
    }

    async getDashboardData(guildId) {
        const config = this.getGuildConfig(guildId);
        const trackedGames = Array.isArray(config?.trackedGames) ? config.trackedGames.map(normalizeTrackedGame).filter(Boolean) : [];
        const appIds = trackedGames.filter(game => game.provider === 'steam').map(game => game.appId);
        const previews = trackedGames.length > 0 ? await this.buildPreview(appIds, trackedGames) : [];

        return {
            config,
            trackedGames,
            previews
        };
    }

    buildArticleAlert(article) {
        return {
            embeds: [createUpdateEmbed(article)]
        };
    }

    async buildTestAlerts(guildId) {
        const config = this.getGuildConfig(guildId);
        
        // If no games configured, return a sample update to preview the embed design
        if (!config?.trackedGames?.length) {
            const sampleUpdate = {
                provider: 'steam',
                providerLabel: 'Steam',
                gameName: 'Portal 2',
                title: 'Test Update - Portal 2 Patch Notes',
                summary: 'This is a sample update to preview how game update notifications will look in your server. Configure tracked games in the dashboard to enable real updates.',
                sections: [
                    {
                        title: 'New Features',
                        items: [
                            'Added new test chamber puzzles',
                            'Improved performance for large levels',
                            'Enhanced graphics quality'
                        ]
                    },
                    {
                        title: 'Bug Fixes',
                        items: [
                            'Fixed audio sync issues',
                            'Resolved minor UI glitches',
                            'Improved stability'
                        ]
                    }
                ],
                version: '2.1.0',
                url: 'https://store.steampowered.com/app/620/',
                date: new Date().toISOString(),
                imageUrl: null,
                tinyImage: null,
                color: 0xf59e0b
            };
            
            return [this.buildArticleAlert(sampleUpdate)];
        }

        const articles = [];
        for (const game of config.trackedGames) {
            const updates = await this.fetchUpdatesForGame(game).catch(() => []);
            if (updates[0]) articles.push(updates[0]);
        }

        return articles
            .sort((left, right) => toEpochMs(right.date, 0) - toEpochMs(left.date, 0))
            .slice(0, 5)
            .map(article => this.buildArticleAlert(article));
    }

    startPolling() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.poll().catch(error => {
            console.error('Steam game update polling failed:', error.message);
        }), POLL_INTERVAL);
        setTimeout(() => {
            this.poll().catch(error => {
                console.error('Initial Steam game update poll failed:', error.message);
            });
        }, 18000);
    }

    async poll() {
        if (this.pollInFlight) return;
        this.pollInFlight = true;

        try {
            const uniqueGames = new Map();

            for (const config of Object.values(this.data.guilds)) {
                for (const game of (Array.isArray(config?.trackedGames) ? config.trackedGames : [])) {
                    const normalizedGame = normalizeTrackedGame(game);
                    const sourceKey = buildSourceKey(normalizedGame);
                    if (sourceKey && !uniqueGames.has(sourceKey)) {
                        uniqueGames.set(sourceKey, normalizedGame);
                    }
                }
            }

            const articleCache = new Map();
            for (const [sourceKey, game] of uniqueGames.entries()) {
                const articles = await this.fetchUpdatesForGame(game).catch(() => []);
                articleCache.set(sourceKey, articles);
            }

            for (const [guildId, config] of Object.entries(this.data.guilds)) {
                const trackedGames = Array.isArray(config?.trackedGames) ? config.trackedGames.map(normalizeTrackedGame).filter(Boolean) : [];
                if (!config?.channelId || config?.enabled === false || trackedGames.length === 0 || !this.isFeatureEnabled(guildId)) {
                    continue;
                }

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                if (!config.lastSeenArticles || typeof config.lastSeenArticles !== 'object') {
                    config.lastSeenArticles = {};
                }

                for (const game of trackedGames) {
                    const sourceKey = buildSourceKey(game);
                    const articles = articleCache.get(sourceKey) || [];
                    const lastSeenKey = config.lastSeenArticles[sourceKey] || '';
                    const unseen = [];

                    for (const article of articles) {
                        if (article.key === lastSeenKey) break;
                        unseen.push(article);
                    }

                    unseen.reverse();

                    for (const article of unseen) {
                        await channel.send(this.buildArticleAlert(article)).catch(() => {});
                    }

                    if (articles[0]) {
                        config.lastSeenArticles[sourceKey] = articles[0].key;
                    }
                }

                config.lastCheckedAt = new Date().toISOString();
                config.trackedGames = trackedGames;
                config.appIds = trackedGames.filter(game => game.provider === 'steam').map(game => game.appId);
            }

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new SteamGameUpdatesManager();