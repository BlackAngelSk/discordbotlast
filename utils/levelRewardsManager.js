const fs = require('fs').promises;
const path = require('path');

class LevelRewardsManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'levelRewards.json');
        this.data = {
            rewards: {}, // { guildId: { level: roleId } }
            settings: {}  // { guildId: { enabled, notificationsEnabled, xpRates } }
        };
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
                console.error('Error loading level rewards:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving level rewards:', error);
        }
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                enabled: true,
                notificationsEnabled: true,
                xpRates: {}, // { channelId: multiplier }
                stackRoles: false // If true, users keep lower level roles
            };
        }
        return this.data.settings[guildId];
    }

    async updateSettings(guildId, updates) {
        const settings = this.getSettings(guildId);
        Object.assign(settings, updates);
        await this.save();
    }

    getRewards(guildId) {
        if (!this.data.rewards[guildId]) {
            this.data.rewards[guildId] = {};
        }
        return this.data.rewards[guildId];
    }

    async addReward(guildId, level, roleId) {
        if (!this.data.rewards[guildId]) {
            this.data.rewards[guildId] = {};
        }
        this.data.rewards[guildId][level] = roleId;
        await this.save();
    }

    async removeReward(guildId, level) {
        if (this.data.rewards[guildId]) {
            delete this.data.rewards[guildId][level];
            await this.save();
        }
    }

    getRoleForLevel(guildId, level) {
        const rewards = this.getRewards(guildId);
        return rewards[level] || null;
    }

    getXPMultiplier(guildId, channelId) {
        const settings = this.getSettings(guildId);
        return settings.xpRates[channelId] || 1;
    }

    async setXPMultiplier(guildId, channelId, multiplier) {
        const settings = this.getSettings(guildId);
        if (!settings.xpRates) settings.xpRates = {};
        settings.xpRates[channelId] = multiplier;
        await this.save();
    }

    getAllRewardsSorted(guildId) {
        const rewards = this.getRewards(guildId);
        return Object.entries(rewards)
            .map(([level, roleId]) => ({ level: parseInt(level), roleId }))
            .sort((a, b) => a.level - b.level);
    }
}

module.exports = new LevelRewardsManager();
