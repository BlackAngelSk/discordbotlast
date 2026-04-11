/**
 * Dynamic Stat Channels Manager
 * Periodically updates voice channel names with live server stats.
 * Config stored per-guild: { guildId: [ { channelId, type } ] }
 * Types: 'members', 'online', 'bots', 'channels', 'roles', 'boosts'
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'statChannels.json');

const TEMPLATES = {
    members:  (g) => `👥 Members: ${g.memberCount}`,
    online:   (g) => `🟢 Online: ${g.members.cache.filter(m => m.presence?.status !== 'offline' && !m.user.bot).size}`,
    bots:     (g) => `🤖 Bots: ${g.members.cache.filter(m => m.user.bot).size}`,
    channels: (g) => `💬 Channels: ${g.channels.cache.size}`,
    roles:    (g) => `🏷️ Roles: ${g.roles.cache.size}`,
    boosts:   (g) => `💎 Boosts: ${g.premiumSubscriptionCount}`,
};

class StatChannelsManager {
    constructor() {
        this.data = {}; // { guildId: [{ channelId, type }] }
        this.interval = null;
    }

    async init(client) {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
        this.startUpdater(client);
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    async addChannel(guildId, channelId, type) {
        if (!TEMPLATES[type]) throw new Error(`Unknown type: ${type}`);
        if (!this.data[guildId]) this.data[guildId] = [];
        // Remove duplicate if same channel re-configured
        this.data[guildId] = this.data[guildId].filter(e => e.channelId !== channelId);
        this.data[guildId].push({ channelId, type });
        await this.save();
    }

    async removeChannel(guildId, channelId) {
        if (!this.data[guildId]) return;
        this.data[guildId] = this.data[guildId].filter(e => e.channelId !== channelId);
        await this.save();
    }

    getChannels(guildId) {
        return this.data[guildId] || [];
    }

    getTypes() {
        return Object.keys(TEMPLATES);
    }

    startUpdater(client) {
        if (this.interval) clearInterval(this.interval);
        // Update every 10 minutes to stay within Discord rate limits
        this.interval = setInterval(() => this.update(client), 10 * 60 * 1000);
        // Run once on startup after a short delay
        setTimeout(() => this.update(client), 10000);
    }

    async update(client) {
        for (const [guildId, entries] of Object.entries(this.data)) {
            if (!entries || entries.length === 0) continue;
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;
            for (const entry of entries) {
                try {
                    const channel = guild.channels.cache.get(entry.channelId);
                    if (!channel) continue;
                    const fn = TEMPLATES[entry.type];
                    if (!fn) continue;
                    const newName = fn(guild);
                    if (channel.name !== newName) {
                        await channel.setName(newName).catch(() => {});
                    }
                } catch (err) {
                    console.error('StatChannel update error:', err);
                }
            }
        }
    }
}

module.exports = new StatChannelsManager();
