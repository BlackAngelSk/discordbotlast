const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamGameUpdates.json');
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails?l=en&appids=';
const APP_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?maxlength=0&format=json&count=10&appid=';
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
const POLL_INTERVAL = 15 * 60 * 1000;
const MAX_TRACKED_GAMES = 20;
const REQUEST_TIMEOUT = 20000;
const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com)'
};

const SPECIAL_TRACKED_SOURCES = {
    minecraft: {
        aliases: ['minecraft', 'mc'],
        sourceId: 'minecraft',
        name: 'Minecraft',
        imageUrl: 'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/screenshots/MCV_SummerDrop2026_BPS_Mar31_Editorial_1920x1080.jpg',
        tinyImage: 'https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/key-art/Homepage_Gameplay-Trailer_MC-OV-logo-300x300.png',
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
        aliases: ['wow', 'wow', 'worldofwarcraft', 'world of warcraft'],
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
                    resolve(JSON.parse(data));
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

function stripHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\/?[^\]]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeEntities(value) {
    return String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function sanitizeText(value) {
    return decodeEntities(stripHtml(value));
}

function truncate(value, maxLength) {
    const safeValue = String(value || '').trim();
    if (!safeValue || safeValue.length <= maxLength) return safeValue;
    return `${safeValue.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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

function buildSourceKey(game) {
    if (!game) return '';
    if (game.provider === 'steam') return `steam:${game.appId}`;
    return game.sourceId || game.provider || '';
}

function buildArticleKey(article) {
    if (!article) return '';
    return String(article.gid || `${article.date || 0}:${article.title || ''}`);
}

function normalizeTrackedGame(game) {
    if (!game) return null;

    if (game.provider === 'minecraft' || game.sourceId === 'minecraft') {
        const source = SPECIAL_TRACKED_SOURCES.minecraft;
        return {
            provider: 'minecraft',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'league' || game.sourceId === 'league') {
        const source = SPECIAL_TRACKED_SOURCES.league;
        return {
            provider: 'league',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'osu' || game.sourceId === 'osu') {
        const source = SPECIAL_TRACKED_SOURCES.osu;
        return {
            provider: 'osu',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'valorant' || game.sourceId === 'valorant') {
        const source = SPECIAL_TRACKED_SOURCES.valorant;
        return {
            provider: 'valorant',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'ffxiv' || game.sourceId === 'ffxiv') {
        const source = SPECIAL_TRACKED_SOURCES.ffxiv;
        return {
            provider: 'ffxiv',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'wow' || game.sourceId === 'wow') {
        const source = SPECIAL_TRACKED_SOURCES.wow;
        return {
            provider: 'wow',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'poe' || game.sourceId === 'poe') {
        const source = SPECIAL_TRACKED_SOURCES.poe;
        return {
            provider: 'poe',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'fortnite' || game.sourceId === 'fortnite') {
        const source = SPECIAL_TRACKED_SOURCES.fortnite;
        return {
            provider: 'fortnite',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'helldivers2' || game.sourceId === 'helldivers2') {
        const source = SPECIAL_TRACKED_SOURCES.helldivers2;
        return {
            provider: 'helldivers2',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
        };
    }

    if (game.provider === 'diablo' || game.sourceId === 'diablo') {
        const source = SPECIAL_TRACKED_SOURCES.diablo;
        return {
            provider: 'diablo',
            sourceId: source.sourceId,
            name: game.name || source.name,
            imageUrl: source.imageUrl,
            tinyImage: source.tinyImage || source.imageUrl,
            storeUrl: source.storeUrl,
            color: source.color,
            providerLabel: source.providerLabel
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
    
    const embed = new EmbedBuilder()
        .setColor(update.color || 0xf59e0b)
        .setAuthor({ name: truncate(update.gameName || update.providerLabel || 'Game Update', 256) })
        .setTitle(truncate(update.title || 'Game update', 256))
        .setFooter({ text: `${update.providerLabel || 'Game'} updates` })
        .setTimestamp(new Date(update.date || Date.now()));

    const sectionText = formatSectionsAsEmbedText(update.sections);
    const summary = truncate(sanitizeText(update.summary || ''), 700);
    const descriptionParts = [];

    if (summary && !sectionText) {
        descriptionParts.push(summary);
    }

    if (sectionText) {
        descriptionParts.push(sectionText);
    }

    if (isValidUrl(update.url)) {
        descriptionParts.push(`[View complete patch notes](${update.url})`);
    }

    if (descriptionParts.length > 0) {
        embed.setDescription(truncate(descriptionParts.join('\n\n'), 4096));
    }

    // Use thumbnail for game icon
    if (update.imageUrl) {
        embed.setThumbnail(update.imageUrl);
    }

    return embed;
}

function buildSteamUpdate(appId, article, game) {
    const title = sanitizeText(article.title) || `Update posted for ${game?.name || `App ${appId}`}`;
    const rawContents = String(article.contents || '');
    const sections = parseSteamSections(rawContents);
    const firstSectionItem = sections[0]?.items?.[0] || '';
    const fallbackSummary = sanitizeText(rawContents.replace(/\\+/g, ' ')).trim();
    const summary = truncate(firstSectionItem || fallbackSummary || 'A new Steam changelog is now live.', 280);

    return {
        key: buildArticleKey(article),
        provider: 'steam',
        providerLabel: 'Steam',
        gameName: game?.name || `App ${appId}`,
        title,
        summary,
        sections,
        url: article.url || buildNewsHubUrl(appId),
        date: Number(article.date) || 0,
        imageUrl: game?.imageUrl || null,
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
        title: `Minecraft Java Edition Update`,
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
    return textMatch?.[1] ? new Date(textMatch[1]).toISOString() : null;
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

    return [{
        key: patchUrl,
        provider: 'league',
        providerLabel: 'League of Legends',
        gameName: 'League of Legends',
        title,
        summary,
        sections: extractLeagueSections(patchHtml),
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
        url: `${OSU_CHANGELOG_URL}/${encodeURIComponent(build.version || build.display_version || '')}`,
        date: build.created_at || Date.now(),
        imageUrl,
        tinyImage: SPECIAL_TRACKED_SOURCES.osu.tinyImage,
        color: SPECIAL_TRACKED_SOURCES.osu.color,
        storeUrl: OSU_CHANGELOG_URL
    }];
}

async function fetchValorantUpdates() {
    try {
        const html = await httpsGetText(VALORANT_PATCH_NOTES_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Valorant Patch Notes';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Valorant patch update is live.',
            280
        );
        
        return [{
            key: `valorant:${Date.now()}`,
            provider: 'valorant',
            providerLabel: 'Valorant',
            gameName: 'Valorant',
            title,
            summary,
            sections: [],
            url: VALORANT_PATCH_NOTES_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.valorant.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.valorant.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.valorant.color,
            storeUrl: VALORANT_PATCH_NOTES_URL
        }];
    } catch (error) {
        console.error('Error fetching Valorant updates:', error);
        return [];
    }
}

async function fetchFFXIVUpdates() {
    try {
        const html = await httpsGetText(FFXIV_PATCH_NOTES_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Final Fantasy XIV Patch Notes';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Final Fantasy XIV patch is available.',
            280
        );
        
        return [{
            key: `ffxiv:${Date.now()}`,
            provider: 'ffxiv',
            providerLabel: 'Final Fantasy XIV',
            gameName: 'Final Fantasy XIV',
            title,
            summary,
            sections: [],
            url: FFXIV_PATCH_NOTES_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.ffxiv.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.ffxiv.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.ffxiv.color,
            storeUrl: FFXIV_PATCH_NOTES_URL
        }];
    } catch (error) {
        console.error('Error fetching FFXIV updates:', error);
        return [];
    }
}

async function fetchWoWUpdates() {
    try {
        const html = await httpsGetText(WOW_PATCH_NOTES_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'World of Warcraft Patch Notes';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New World of Warcraft patch is live.',
            280
        );
        
        return [{
            key: `wow:${Date.now()}`,
            provider: 'wow',
            providerLabel: 'World of Warcraft',
            gameName: 'World of Warcraft',
            title,
            summary,
            sections: [],
            url: WOW_PATCH_NOTES_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.wow.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.wow.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.wow.color,
            storeUrl: WOW_PATCH_NOTES_URL
        }];
    } catch (error) {
        console.error('Error fetching WoW updates:', error);
        return [];
    }
}

async function fetchPoEUpdates() {
    try {
        const html = await httpsGetText(POE_NEWS_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Path of Exile News';
        const descMatch = html.match(/<p[^>]*>(.*?)<\/p>/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Path of Exile updates and news.',
            280
        );
        
        return [{
            key: `poe:${Date.now()}`,
            provider: 'poe',
            providerLabel: 'Path of Exile',
            gameName: 'Path of Exile',
            title,
            summary,
            sections: [],
            url: POE_NEWS_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.poe.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.poe.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.poe.color,
            storeUrl: POE_NEWS_URL
        }];
    } catch (error) {
        console.error('Error fetching Path of Exile updates:', error);
        return [];
    }
}

async function fetchFortniteUpdates() {
    try {
        const html = await httpsGetText(FORTNITE_NEWS_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Fortnite Game Updates';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Fortnite updates and events available.',
            280
        );
        
        return [{
            key: `fortnite:${Date.now()}`,
            provider: 'fortnite',
            providerLabel: 'Fortnite',
            gameName: 'Fortnite',
            title,
            summary,
            sections: [],
            url: FORTNITE_NEWS_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.fortnite.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.fortnite.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.fortnite.color,
            storeUrl: FORTNITE_NEWS_URL
        }];
    } catch (error) {
        console.error('Error fetching Fortnite updates:', error);
        return [];
    }
}

async function fetchHelldivers2Updates() {
    try {
        const html = await httpsGetText(HELLDIVERS2_NEWS_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Helldivers 2 Updates';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Helldivers 2 updates and missions.',
            280
        );
        
        return [{
            key: `helldivers2:${Date.now()}`,
            provider: 'helldivers2',
            providerLabel: 'Helldivers 2',
            gameName: 'Helldivers 2',
            title,
            summary,
            sections: [],
            url: HELLDIVERS2_NEWS_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.helldivers2.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.helldivers2.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.helldivers2.color,
            storeUrl: HELLDIVERS2_NEWS_URL
        }];
    } catch (error) {
        console.error('Error fetching Helldivers 2 updates:', error);
        return [];
    }
}

async function fetchDiabloUpdates() {
    try {
        const html = await httpsGetText(DIABLO_NEWS_URL);
        const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? sanitizeText(titleMatch[1]) : 'Diablo IV News';
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const summary = truncate(
            descMatch ? sanitizeText(descMatch[1]) : 'New Diablo IV patches and news.',
            280
        );
        
        return [{
            key: `diablo:${Date.now()}`,
            provider: 'diablo',
            providerLabel: 'Diablo IV',
            gameName: 'Diablo IV',
            title,
            summary,
            sections: [],
            url: DIABLO_NEWS_URL,
            date: Date.now(),
            imageUrl: SPECIAL_TRACKED_SOURCES.diablo.imageUrl,
            tinyImage: SPECIAL_TRACKED_SOURCES.diablo.tinyImage,
            color: SPECIAL_TRACKED_SOURCES.diablo.color,
            storeUrl: DIABLO_NEWS_URL
        }];
    } catch (error) {
        console.error('Error fetching Diablo updates:', error);
        return [];
    }
}

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
        return items
            .map(article => buildSteamUpdate(appId, article, game))
            .filter(article => article.key)
            .sort((left, right) => Number(right.date) - Number(left.date));
    }

    async fetchUpdatesForGame(game) {
        if (!game) return [];

        if (game.provider === 'minecraft') {
            return fetchMinecraftUpdates();
        }

        if (game.provider === 'league') {
            return fetchLeagueUpdates();
        }

        if (game.provider === 'osu') {
            return fetchOsuUpdates();
        }

        if (game.provider === 'valorant') {
            return fetchValorantUpdates();
        }

        if (game.provider === 'ffxiv') {
            return fetchFFXIVUpdates();
        }

        if (game.provider === 'wow') {
            return fetchWoWUpdates();
        }

        if (game.provider === 'poe') {
            return fetchPoEUpdates();
        }

        if (game.provider === 'fortnite') {
            return fetchFortniteUpdates();
        }

        if (game.provider === 'helldivers2') {
            return fetchHelldivers2Updates();
        }

        if (game.provider === 'diablo') {
            return fetchDiabloUpdates();
        }

        return this.fetchNewsForApp(game.appId, game);
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
                url: 'https://store.steampowered.com/app/620/',
                date: new Date().toISOString(),
                imageUrl: null,
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
            .sort((left, right) => Number(new Date(right.date || 0)) - Number(new Date(left.date || 0)))
            .slice(0, 3)
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