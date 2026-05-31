const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamFreeGamesAlerts.json');
const API_URL = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';
const STEAM_FEATURED_URL = 'https://store.steampowered.com/api/featuredcategories?cc=US&l=en';
const STEAM_APPDETAILS_BASE = 'https://store.steampowered.com/api/appdetails?filters=basic,price_overview,short_description&appids=';
const POLL_INTERVAL = 30 * 60 * 1000;

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
    return /free\s*weekend|weekend\s*free|temporar(?:y|ily)\s+free|free\s*trial|play\s+(?:it\s+)?free\s+(?:this\s+)?weekend|limited[\s-]time(?:\s+free)?|free\s*to\s*play\s+for\s+(?:a\s+)?limited\s+time|play\s+for\s+free\s+for\s+limited\s+time|available\s+to\s+play\s+free|play\s+free\s+(?:now\s+)?until|free\s+access\s+(?:until|ends?|through)|will\s+be\s+removed|removed\s+from\s+(?:your\s+)?library|no\s+longer\s+(?:available|accessible)\s+after|access\s+ends?\s+(?:on|at)|weekend\s+deal|free\s+play\s+event|play\s+free\s+this\s+week(?:end)?|trial\s+period|demo\s+free|for\s+a\s+limited\s+time\s+only/.test(content);
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

    const endUnix = toUnixTimestamp(giveaway.endDate);
    if (endUnix) {
        parts.push(`⏰ ends <t:${endUnix}:R>`);
    } else {
        parts.push('limited time');
    }

    return `${parts.join(' — ')}\n${giveaway.url}`;
}

function createPromoSummaryEmbed(giveaways) {
    return new EmbedBuilder()
        .setColor(0xf4a318)
        .setTitle(giveaways.length > 1 ? '🕹️ Steam Promo Games — Play Free This Weekend' : '🕹️ Steam Promo Game — Play Free Now')
        .setURL('https://store.steampowered.com/specials')
        .setDescription(giveaways.map(formatPromoLine).join('\n\n'))
        .setFooter({ text: 'Steam promo game alerts • Limited-time free play' })
        .setTimestamp();
}

function createPromoEmbed(giveaway) {
    const details = [];

    if (giveaway.description) {
        details.push(giveaway.description);
    }

    const endUnix = toUnixTimestamp(giveaway.endDate);
    const publishedUnix = toUnixTimestamp(giveaway.publishedDate);
    const timing = [];

    if (publishedUnix) {
        timing.push(`Available from <t:${publishedUnix}:F>`);
    }

    if (endUnix) {
        timing.push(`Free until <t:${endUnix}:F> (<t:${endUnix}:R>)`);
    }

    if (timing.length > 0) {
        details.push(timing.join('\n'));
    }

    if (giveaway.instructions) {
        details.push(`How to play: ${truncate(giveaway.instructions, 200)}`);
    }

    const embed = new EmbedBuilder()
        .setColor(0xf4a318)
        .setTitle(`🕹️ ${giveaway.title} — Free to Play Now`)
        .setURL(giveaway.url)
        .setDescription(details.join('\n\n') || giveaway.url)
        .addFields(
            {
                name: 'Retail Value',
                value: giveaway.worth && !/^n\/?a$/i.test(giveaway.worth) ? giveaway.worth : 'Paid game',
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

function extractAppIdFromString(str) {
    if (!str) return null;
    const m = String(str).match(/\/apps?\/(\d+)/);
    return m ? m[1] : null;
}

async function checkSteamAppForFreeWeekend(appId) {
    try {
        const details = await steamHttpsGetJson(`${STEAM_APPDETAILS_BASE}${appId}&cc=US`);
        const appData = details?.[appId];
        if (!appData?.success || !appData?.data) return null;

        const data = appData.data;
        const po = data.price_overview;

        // Steam category id 35 = "Free Weekend" — covers F2P games with free weekends
        const hasFreeWeekendCategory = Array.isArray(data.categories) &&
            data.categories.some(c => c.id === 35);

        // detailed_description starting with <h1>Free Weekend</h1> — used by PoE2-style events
        const hasFreWeekendBanner = typeof data.detailed_description === 'string' &&
            /^\s*<h1>\s*Free\s+Weekend/i.test(data.detailed_description);

        // For paid games: 100% discounted right now
        const isPaidFreeWeekend = po && po.discount_percent === 100 && po.initial > 0 && !data.is_free;

        // Must match at least one signal — skip otherwise
        if (!hasFreeWeekendCategory && !hasFreWeekendBanner && !isPaidFreeWeekend) return null;

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
        const appIds = new Set();

        // Source 1: featuredcategories — spotlight sections + specials
        const featured = await steamHttpsGetJson(STEAM_FEATURED_URL);

        // Scan ALL numbered sections (spotlights, daily deals, etc.)
        for (let k = 0; k <= 15; k++) {
            const section = featured?.[k];
            if (!section) continue;
            const items = Array.isArray(section.items) ? section.items : [];
            items.forEach(item => {
                // App URL in spotlight (e.g. Weekend Deal banners)
                const fromUrl = extractAppIdFromString(item?.url);
                if (fromUrl) appIds.add(fromUrl);
                // Inline item with an id field (daily deal, etc.)
                if (item?.id) appIds.add(String(item.id));
            });
        }

        // Named specials section
        const specials = featured?.specials?.items;
        if (Array.isArray(specials)) {
            specials.forEach(item => {
                if (item?.id) appIds.add(String(item.id));
                // Quick-win: if already 100% off, note it
            });
        }

        // Source 2: Steam search — free specials including F2P games with free weekends (hidef2p=0)
        try {
            const search = await steamHttpsGetJson(
                'https://store.steampowered.com/search/results/?specials=1&maxprice=free&hidef2p=0&json=1&cc=US&l=en&count=50'
            );
            const searchItems = Array.isArray(search?.items) ? search.items : [];
            searchItems.forEach(item => {
                const fromLogo = extractAppIdFromString(item?.logo);
                if (fromLogo) appIds.add(fromLogo);
                if (item?.id) appIds.add(String(item.id));
            });
        } catch {
            // search fetch optional
        }

        // Source 3: Steam search with "Weekend Deal" sub-type tag (catches F2P free weekends)
        try {
            const weekendSearch = await steamHttpsGetJson(
                'https://store.steampowered.com/search/results/?specials=1&maxprice=free&hidef2p=0&json=1&cc=US&l=en&count=100&category1=998'
            );
            const wItems = Array.isArray(weekendSearch?.items) ? weekendSearch.items : [];
            wItems.forEach(item => {
                const fromLogo = extractAppIdFromString(item?.logo);
                if (fromLogo) appIds.add(fromLogo);
                if (item?.id) appIds.add(String(item.id));
            });
        } catch {
            // optional
        }

        // Source 4: Steam specials without price cap — finds games like PoE2 on sale (50% off)
        // but running a "Play for Free Weekend" event. Limited to 100 to avoid too many appdetails calls.
        try {
            const allSpecials = await steamHttpsGetJson(
                'https://store.steampowered.com/search/results/?specials=1&hidef2p=0&json=1&cc=US&l=en&count=100'
            );
            const sItems = Array.isArray(allSpecials?.items) ? allSpecials.items : [];
            sItems.forEach(item => {
                const fromLogo = extractAppIdFromString(item?.logo);
                if (fromLogo) appIds.add(fromLogo);
                if (item?.id) appIds.add(String(item.id));
            });
        } catch {
            // optional
        }

        if (appIds.size === 0) return [];

        // Check each candidate app via appdetails for a live 100% discount
        const promos = [];
        const seenTitles = new Set();

        for (const id of appIds) {
            const promo = await checkSteamAppForFreeWeekend(id);
            if (!promo) continue;
            const key = promo.title.toLowerCase();
            if (seenTitles.has(key)) continue;
            seenTitles.add(key);
            promos.push(promo);
        }

        return promos;
    } catch (err) {
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

        // GamerPower promos (keyword-detected from their feed)
        const gpPromos = giveaways.filter(isTemporaryPromoGiveaway);
        const freeToKeepGiveaways = giveaways.filter(giveaway => !isTemporaryPromoGiveaway(giveaway));

        // Steam store promos (100%-off paid games = free weekends / events)
        const steamStorePromos = await fetchSteamStorePromos();

        // Merge: dedupe by title to avoid duplicates if both sources list the same game
        const seenTitles = new Set(gpPromos.map(g => g.title.toLowerCase()));
        const uniqueSteamPromos = steamStorePromos.filter(g => !seenTitles.has(g.title.toLowerCase()));
        const promoGiveaways = [...gpPromos, ...uniqueSteamPromos]
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
                const newPromos = snapshot.promoGiveaways.filter(g => !announcedIds.includes(String(g.id)));

                if (newPromos.length > 0) {
                    const payload = this.buildPromoAlert(snapshot, newPromos);
                    if (payload) {
                        for (const messagePayload of payload.messages) {
                            await channel.send(messagePayload).catch(() => {});
                        }
                    }
                }

                config.announcedIds = currentPromoIds;
                config.lastCheckedAt = snapshot.fetchedAt;
            }

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new SteamFreeGamesAlertsManager();