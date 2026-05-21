const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('./discordFetch');
const settingsManager = require('./settingsManager');

const DATA_FILE = path.join(__dirname, '..', 'data', 'steamFreeGamesAlerts.json');
const API_URL = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';
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
        return settings.features?.steamFreeGamesAlerts !== false;
    }

    async enableAlerts(guildId, channelId) {
        const snapshot = await this.fetchSnapshot().catch(error => {
            console.error('Steam free games snapshot fetch failed while enabling alerts:', error.message);
            return null;
        });

        this.data.guilds[guildId] = {
            channelId,
            announcedIds: snapshot ? snapshot.giveaways.map(giveaway => giveaway.id) : [],
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

        return {
            fetchedAt: new Date().toISOString(),
            giveaways
        };
    }

    buildCurrentAlert(snapshot, giveaways = snapshot?.giveaways || []) {
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
            const currentIds = snapshot.giveaways.map(giveaway => giveaway.id);

            for (const [guildId, config] of Object.entries(this.data.guilds)) {
                if (!config?.channelId || !this.isFeatureEnabled(guildId)) continue;

                const channel = await fetchChannelSafe(this.client, config.channelId);
                if (!channel || !channel.isTextBased()) continue;

                const announcedIds = Array.isArray(config.announcedIds) ? config.announcedIds.map(String) : [];
                const newGiveaways = snapshot.giveaways.filter(giveaway => !announcedIds.includes(String(giveaway.id)));

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

            await this.save();
        } finally {
            this.pollInFlight = false;
        }
    }
}

module.exports = new SteamFreeGamesAlertsManager();