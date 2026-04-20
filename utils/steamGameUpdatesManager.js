const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamGameUpdates.json');
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails?l=en&appids=';
const APP_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?maxlength=500&format=json&count=10&appid=';
const APP_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/?l=en&cc=US&term=';
const POLL_INTERVAL = 15 * 60 * 1000;
const MAX_TRACKED_GAMES = 20;

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 10000 }, res => {
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
                } catch {
                    reject(new Error('Invalid JSON response from Steam API'));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Steam API request timed out'));
        });
    });
}

function stripHtml(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\/?.+?\]/g, ' ')
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
    if (!value || value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function toUnixTimestamp(value) {
    const timestamp = typeof value === 'number' ? value : Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeAppId(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const urlMatch = raw.match(/store\.steampowered\.com\/app\/(\d+)/i);
    const normalized = urlMatch ? urlMatch[1] : raw;

    return /^\d+$/.test(normalized) ? normalized : null;
}

function parseTrackedAppIds(input) {
    const parts = String(input || '')
        .split(/[\n,]+/)
        .map(part => part.trim())
        .filter(Boolean);

    const invalidEntries = [];
    const appIds = [];
    const seen = new Set();

    for (const entry of parts) {
        const appId = normalizeAppId(entry);
        if (!appId) {
            invalidEntries.push(entry);
            continue;
        }

        if (seen.has(appId)) continue;
        seen.add(appId);
        appIds.push(appId);
    }

    return {
        appIds: appIds.slice(0, MAX_TRACKED_GAMES),
        invalidEntries,
        wasTrimmed: appIds.length > MAX_TRACKED_GAMES
    };
}

function buildArticleKey(article) {
    if (!article) return '';
    return String(article.gid || `${article.date || 0}:${article.title || ''}`);
}

function buildStoreUrl(appId) {
    return `https://store.steampowered.com/app/${appId}/`;
}

function buildNewsHubUrl(appId) {
    return `https://store.steampowered.com/news/app/${appId}`;
}

function normalizeTrackedGame(game) {
    if (!game) return null;

    return {
        appId: String(game.appId),
        name: game.name || `App ${game.appId}`,
        imageUrl: game.imageUrl || game.tinyImage || null,
        tinyImage: game.tinyImage || game.imageUrl || null,
        storeUrl: game.storeUrl || buildStoreUrl(game.appId)
    };
}

function normalizeArticle(appId, article, game) {
    const safeTitle = sanitizeText(article.title) || `Update posted for ${game?.name || `App ${appId}`}`;
    const safeContents = truncate(sanitizeText(article.contents), 1200) || 'No changelog text was included in this Steam post.';

    return {
        key: buildArticleKey(article),
        gid: article.gid || null,
        appId: String(appId),
        title: safeTitle,
        contents: safeContents,
        author: sanitizeText(article.author) || 'Steam News',
        feedLabel: sanitizeText(article.feedlabel) || 'Steam News',
        url: article.url || buildNewsHubUrl(appId),
        date: Number(article.date) || 0,
        gameName: game?.name || `App ${appId}`,
        imageUrl: game?.imageUrl || null,
        storeUrl: game?.storeUrl || buildStoreUrl(appId)
    };
}

function createArticleEmbed(article) {
    const publishedUnix = toUnixTimestamp(article.date);
    const descriptionLines = [article.contents];

    if (publishedUnix) {
        descriptionLines.push(`Published <t:${publishedUnix}:F>`);
    }

    descriptionLines.push(`[Open changelog](${article.url})`);
    descriptionLines.push(`[Open Steam store page](${article.storeUrl})`);

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(`Steam Update: ${article.gameName}`)
        .setURL(article.url)
        .setDescription(descriptionLines.filter(Boolean).join('\n\n'))
        .addFields(
            { name: 'Headline', value: truncate(article.title, 256) || 'Steam update', inline: false },
            { name: 'Source', value: truncate(article.feedLabel || article.author || 'Steam News', 256), inline: true }
        )
        .setFooter({ text: 'Steam game updates' })
        .setTimestamp(new Date((article.date || Math.floor(Date.now() / 1000)) * 1000));

    if (article.imageUrl) {
        embed.setThumbnail(article.imageUrl);
    }

    return embed;
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

        this.startPolling();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    getGuildConfig(guildId) {
        return this.data.guilds[guildId] || null;
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

        return {
            appId: String(appId),
            name: result.data.name || `App ${appId}`,
            imageUrl: result.data.header_image || null,
            tinyImage: result.data.capsule_image || result.data.header_image || null,
            storeUrl: buildStoreUrl(appId)
        };
    }

    async searchStoreGames(query) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery || normalizedQuery.length < 2) {
            return [];
        }

        const exactAppId = normalizeAppId(normalizedQuery);
        const results = [];
        const seen = new Set();

        if (exactAppId) {
            const exactMatch = await this.fetchGameDetails(exactAppId).catch(() => null);
            if (exactMatch) {
                const normalized = normalizeTrackedGame(exactMatch);
                results.push(normalized);
                seen.add(normalized.appId);
            }
        }

        const payload = await httpsGetJson(`${APP_SEARCH_URL}${encodeURIComponent(normalizedQuery)}`);
        const items = Array.isArray(payload?.items) ? payload.items : [];

        for (const item of items) {
            const appId = normalizeAppId(item.id);
            if (!appId || seen.has(appId)) continue;
            seen.add(appId);
            results.push(normalizeTrackedGame({
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
            .map(article => normalizeArticle(appId, article, game))
            .filter(article => article.key)
            .sort((left, right) => right.date - left.date);
    }

    async resolveTrackedGames(rawGames) {
        const { appIds, invalidEntries, wasTrimmed } = parseTrackedAppIds(rawGames);

        if (invalidEntries.length > 0) {
            throw new Error(`Invalid Steam app IDs or URLs: ${invalidEntries.slice(0, 5).join(', ')}`);
        }

        if (appIds.length === 0) {
            throw new Error('Add at least one Steam app ID or Steam store URL');
        }

        const trackedGames = (await Promise.all(appIds.map(appId => this.fetchGameDetails(appId)))).map(normalizeTrackedGame);

        return {
            appIds,
            trackedGames,
            wasTrimmed
        };
    }

    async buildPreview(appIds, trackedGames) {
        const previews = [];

        for (const game of trackedGames) {
            const articles = await this.fetchNewsForApp(game.appId, game).catch(() => []);
            previews.push({
                ...game,
                latestArticle: articles[0] || null
            });
        }

        return previews.sort((left, right) => left.name.localeCompare(right.name));
    }

    async updateGuildConfig(guildId, channelId, rawGames) {
        const { appIds, trackedGames, wasTrimmed } = await this.resolveTrackedGames(rawGames);
        const lastSeenArticles = {};

        for (const game of trackedGames) {
            const articles = await this.fetchNewsForApp(game.appId, game).catch(() => []);
            lastSeenArticles[game.appId] = articles[0]?.key || '';
        }

        this.data.guilds[guildId] = {
            channelId,
            appIds,
            trackedGames,
            rawGames: String(rawGames || '').trim() || appIds.join('\n'),
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
        const appIds = Array.isArray(config?.appIds) ? config.appIds : [];
        const previews = trackedGames.length > 0 ? await this.buildPreview(appIds, trackedGames) : [];

        return {
            config,
            trackedGames,
            previews
        };
    }

    buildArticleAlert(article) {
        return {
            embeds: [createArticleEmbed(article)]
        };
    }

    async buildTestAlerts(guildId) {
        const config = this.getGuildConfig(guildId);
        if (!config?.trackedGames?.length) {
            throw new Error('No Steam games are configured for this server yet');
        }

        const articles = [];
        for (const game of config.trackedGames) {
            const news = await this.fetchNewsForApp(game.appId, game).catch(() => []);
            if (news[0]) articles.push(news[0]);
        }

        return articles
            .sort((left, right) => right.date - left.date)
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
            const uniqueAppIds = Array.from(new Set(Object.values(this.data.guilds)
                .flatMap(config => Array.isArray(config?.appIds) ? config.appIds : [])));
            const articleCache = new Map();

            for (const appId of uniqueAppIds) {
                const sampleGame = Object.values(this.data.guilds)
                    .flatMap(config => Array.isArray(config?.trackedGames) ? config.trackedGames : [])
                    .find(game => game.appId === appId) || { appId, name: `App ${appId}`, storeUrl: buildStoreUrl(appId) };

                const articles = await this.fetchNewsForApp(appId, sampleGame).catch(() => []);
                articleCache.set(appId, articles);
            }

            for (const [guildId, config] of Object.entries(this.data.guilds)) {
                if (!config?.channelId || !Array.isArray(config.appIds) || config.appIds.length === 0 || !this.isFeatureEnabled(guildId)) {
                    continue;
                }

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                if (!config.lastSeenArticles || typeof config.lastSeenArticles !== 'object') {
                    config.lastSeenArticles = {};
                }

                for (const game of (config.trackedGames || [])) {
                    const articles = articleCache.get(game.appId) || [];
                    const lastSeenKey = config.lastSeenArticles[game.appId] || '';
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
                        config.lastSeenArticles[game.appId] = articles[0].key;
                    }
                }

                config.lastCheckedAt = new Date().toISOString();
            }

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new SteamGameUpdatesManager();