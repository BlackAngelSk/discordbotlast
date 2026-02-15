const fs = require('fs').promises;
const path = require('path');

class AFKManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'afk.json');
        this.data = {}; // { guildId: { userId: { reason, timestamp } } }
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading AFK data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving AFK data:', error);
        }
    }

    async setAFK(guildId, userId, reason = 'AFK') {
        if (!this.data[guildId]) {
            this.data[guildId] = {};
        }

        this.data[guildId][userId] = {
            reason,
            timestamp: Date.now()
        };

        await this.save();
    }

    async removeAFK(guildId, userId) {
        if (this.data[guildId]?.[userId]) {
            const afkData = this.data[guildId][userId];
            delete this.data[guildId][userId];
            await this.save();
            return afkData;
        }
        return null;
    }

    isAFK(guildId, userId) {
        return this.data[guildId]?.[userId] || null;
    }

    getAFKTime(guildId, userId) {
        const afkData = this.isAFK(guildId, userId);
        if (!afkData) return null;

        const duration = Date.now() - afkData.timestamp;
        return this.formatDuration(duration);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    }

    getGuildAFKUsers(guildId) {
        return this.data[guildId] || {};
    }
}

module.exports = new AFKManager();
