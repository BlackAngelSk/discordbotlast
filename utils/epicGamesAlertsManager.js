const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'epicGamesAlerts.json');
const API_URL = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
const POLL_INTERVAL = 30 * 60 * 1000;

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
                    reject(new Error('Invalid JSON response from Epic Games API'));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Epic Games API request timed out'));
        });
    });
}

function normalizeStoreSlug(element) {
    const mappedSlug = element.catalogNs?.mappings?.find(mapping => mapping.pageSlug)?.pageSlug;
    const rawSlug = mappedSlug || element.productSlug || element.urlSlug || null;
    if (!rawSlug) return null;
    return rawSlug.replace(/^\/+/, '').replace(/\/home$/, '');
}

function buildStoreUrl(element) {
    const slug = normalizeStoreSlug(element);
    return slug ? `https://store.epicgames.com/en-US/p/${slug}` : 'https://store.epicgames.com/en-US/free-games';
}

function getBestImage(element) {
    const preferredTypes = ['DieselStoreFrontWide', 'OfferImageWide', 'Thumbnail', 'DieselGameBox'];
    const images = Array.isArray(element.keyImages) ? element.keyImages : [];

    for (const type of preferredTypes) {
        const match = images.find(image => image.type === type && image.url);
        if (match) return match.url;
    }

    return images.find(image => image.url)?.url || null;
}

function toUnixTimestamp(value) {
    const timestamp = Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function buildOfferKey(offers) {
    return offers
        .map(offer => `${offer.id}:${offer.startDate}:${offer.endDate || ''}`)
        .sort()
        .join('|');
}

function formatOfferLine(offer, includeStart = false) {
    const parts = [`• **${offer.title}**`];
    const startUnix = toUnixTimestamp(offer.startDate);
    const endUnix = toUnixTimestamp(offer.endDate);

    if (includeStart && startUnix) {
        parts.push(`starts <t:${startUnix}:F>`);
    }

    if (endUnix) {
        parts.push(`ends <t:${endUnix}:F>`);
    }

    return `${parts.join(' - ')}\n${offer.url}`;
}

function createOfferEmbed(offer, { color, heading, footerText, includeStart = false }) {
    const startUnix = toUnixTimestamp(offer.startDate);
    const endUnix = toUnixTimestamp(offer.endDate);
    const timing = [];

    if (includeStart && startUnix) {
        timing.push(`Starts <t:${startUnix}:F>`);
    }

    if (endUnix) {
        timing.push(`Ends <t:${endUnix}:F>`);
    }

    const description = [offer.url, timing.join('\n')].filter(Boolean).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${heading}: ${offer.title}`)
        .setURL(offer.url)
        .setDescription(description)
        .setFooter({ text: footerText })
        .setTimestamp();

    if (offer.imageUrl) {
        embed.setImage(offer.imageUrl);
    }

    return embed;
}

function createSummaryEmbed(offers, { color, title, footerText, includeStart = false }) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setURL('https://store.epicgames.com/en-US/free-games')
        .setDescription(offers.map(offer => formatOfferLine(offer, includeStart)).join('\n\n'))
        .setFooter({ text: footerText })
        .setTimestamp();
}

class EpicGamesAlertsManager {
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
                console.error('Error loading Epic Games alerts config:', error);
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

    async enableAlerts(guildId, channelId) {
        const snapshot = await this.fetchSnapshot().catch(error => {
            console.error('Epic Games snapshot fetch failed while enabling alerts:', error.message);
            return null;
        });

        this.data.guilds[guildId] = {
            channelId,
            lastCurrentKey: snapshot ? buildOfferKey(snapshot.currentOffers) : '',
            lastUpcomingKey: snapshot ? buildOfferKey(snapshot.upcomingOffers) : '',
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
        const elements = payload?.data?.Catalog?.searchStore?.elements;

        if (!Array.isArray(elements)) {
            throw new Error('Epic Games API returned an unexpected payload');
        }

        const now = Date.now();
        const currentOffers = [];
        const upcomingOffers = [];

        for (const element of elements) {
            const promotions = element.promotions || {};
            const activeGroups = Array.isArray(promotions.promotionalOffers) ? promotions.promotionalOffers : [];
            const upcomingGroups = Array.isArray(promotions.upcomingPromotionalOffers) ? promotions.upcomingPromotionalOffers : [];

            for (const group of activeGroups) {
                for (const promo of (group.promotionalOffers || [])) {
                    const start = new Date(promo.startDate).getTime();
                    const end = new Date(promo.endDate).getTime();
                    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                    if (start > now || end <= now) continue;

                    currentOffers.push({
                        id: element.id,
                        title: element.title || 'Unknown title',
                        url: buildStoreUrl(element),
                        imageUrl: getBestImage(element),
                        startDate: promo.startDate,
                        endDate: promo.endDate
                    });
                }
            }

            for (const group of upcomingGroups) {
                for (const promo of (group.promotionalOffers || [])) {
                    const start = new Date(promo.startDate).getTime();
                    if (!Number.isFinite(start) || start <= now) continue;

                    upcomingOffers.push({
                        id: element.id,
                        title: element.title || 'Unknown title',
                        url: buildStoreUrl(element),
                        imageUrl: getBestImage(element),
                        startDate: promo.startDate,
                        endDate: promo.endDate
                    });
                }
            }
        }

        const uniqueCurrentOffers = this.dedupeOffers(currentOffers);
        const uniqueUpcomingOffers = this.dedupeOffers(upcomingOffers);

        uniqueCurrentOffers.sort((left, right) => left.title.localeCompare(right.title));
        uniqueUpcomingOffers.sort((left, right) => new Date(left.startDate) - new Date(right.startDate) || left.title.localeCompare(right.title));

        return {
            fetchedAt: new Date().toISOString(),
            currentOffers: uniqueCurrentOffers,
            upcomingOffers: uniqueUpcomingOffers
        };
    }

    dedupeOffers(offers) {
        const seen = new Set();
        const unique = [];

        for (const offer of offers) {
            const key = `${offer.id}:${offer.startDate}:${offer.endDate || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(offer);
        }

        return unique;
    }

    buildCurrentAlert(snapshot) {
        if (!snapshot.currentOffers.length) return null;

        const summaryEmbed = createSummaryEmbed(snapshot.currentOffers, {
            color: 0x313131,
            title: snapshot.currentOffers.length > 1 ? '🎮 Epic Games Free Games Available Now' : '🎮 Epic Games Free Game Available Now',
            footerText: 'Epic Games Store free games'
        });

        const offerMessages = snapshot.currentOffers.map(offer => ({
            embeds: [createOfferEmbed(offer, {
                color: 0x313131,
                heading: '🎮 Free Now',
                footerText: 'Epic Games Store free games'
            })]
        }));

        return {
            messages: [
                { embeds: [summaryEmbed] },
                ...offerMessages
            ]
        };
    }

    isFeatureEnabled(guildId) {
        const settings = settingsManager.get(guildId);
        return settings.features?.epicGamesAlerts !== false;
    }

    startPolling() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.poll().catch(error => {
            console.error('Epic Games alert polling failed:', error.message);
        }), POLL_INTERVAL);
        setTimeout(() => {
            this.poll().catch(error => {
                console.error('Initial Epic Games alert poll failed:', error.message);
            });
        }, 12000);
    }

    async poll() {
        if (this.pollInFlight) return;
        this.pollInFlight = true;

        try {
            const snapshot = await this.fetchSnapshot();
            const currentKey = buildOfferKey(snapshot.currentOffers);
            const upcomingKey = buildOfferKey(snapshot.upcomingOffers);

            for (const [guildId, config] of Object.entries(this.data.guilds)) {
                if (!config?.channelId || !this.isFeatureEnabled(guildId)) continue;

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                const isFirstSeen = typeof config.lastCurrentKey !== 'string' && typeof config.lastUpcomingKey !== 'string';
                if (isFirstSeen) {
                    config.lastCurrentKey = currentKey;
                    config.lastUpcomingKey = upcomingKey;
                    config.lastCheckedAt = snapshot.fetchedAt;
                    continue;
                }

                if (config.lastCurrentKey !== currentKey && snapshot.currentOffers.length > 0) {
                    const payload = this.buildCurrentAlert(snapshot);
                    if (payload) {
                        for (const messagePayload of payload.messages) {
                            await channel.send(messagePayload).catch(() => {});
                        }
                    }
                }

                config.lastCurrentKey = currentKey;
                config.lastUpcomingKey = upcomingKey;
                config.lastCheckedAt = snapshot.fetchedAt;
            }

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new EpicGamesAlertsManager();