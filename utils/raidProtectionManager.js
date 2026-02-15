const fs = require('fs').promises;
const path = require('path');

class RaidProtectionManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'raidProtection.json');
        this.data = {
            settings: {}, // { guildId: { enabled, joinRateLimit, accountAgeRequired, verificationEnabled } }
            joinLog: {}, // { guildId: [{ userId, timestamp }] }
            verified: {}, // { guildId: { userId: true } }
            locked: {} // { guildId: true/false }
        };
        this.cleanupInterval = null;
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
                console.error('Error loading raid protection:', error);
            }
        }

        // Clean up old join logs every 10 minutes
        this.cleanupInterval = setInterval(() => this.cleanupJoinLog(), 600000);
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving raid protection:', error);
        }
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                enabled: false,
                joinRateLimit: 5, // Max joins per timeWindow
                timeWindow: 10, // Seconds
                accountAgeRequired: 7, // Days
                verificationEnabled: false,
                verificationRole: null,
                autoKickNewAccounts: false,
                autoKickRaiders: true
            };
        }
        return this.data.settings[guildId];
    }

    async updateSettings(guildId, updates) {
        const settings = this.getSettings(guildId);
        Object.assign(settings, updates);
        await this.save();
    }

    async logJoin(guildId, userId) {
        if (!this.data.joinLog[guildId]) {
            this.data.joinLog[guildId] = [];
        }

        const now = Date.now();
        this.data.joinLog[guildId].push({ userId, timestamp: now });

        // Keep only last 100 joins
        if (this.data.joinLog[guildId].length > 100) {
            this.data.joinLog[guildId] = this.data.joinLog[guildId].slice(-100);
        }

        await this.save();
    }

    checkRaidAlert(guildId) {
        const settings = this.getSettings(guildId);
        if (!settings.enabled) return { isRaid: false };

        const joinLog = this.data.joinLog[guildId] || [];
        const now = Date.now();
        const timeWindow = settings.timeWindow * 1000;

        // Count joins in the time window
        const recentJoins = joinLog.filter(
            log => now - log.timestamp < timeWindow
        );

        if (recentJoins.length >= settings.joinRateLimit) {
            return {
                isRaid: true,
                joinCount: recentJoins.length,
                timeWindow: settings.timeWindow,
                recentUsers: recentJoins.map(j => j.userId)
            };
        }

        return { isRaid: false, joinCount: recentJoins.length };
    }

    isAccountTooNew(member, requiredDays) {
        const accountAge = Date.now() - member.user.createdTimestamp;
        const requiredAge = requiredDays * 24 * 60 * 60 * 1000;
        return accountAge < requiredAge;
    }

    async setLockdown(guildId, locked) {
        this.data.locked[guildId] = locked;
        await this.save();
    }

    isLocked(guildId) {
        return this.data.locked[guildId] || false;
    }

    async verifyUser(guildId, userId) {
        if (!this.data.verified[guildId]) {
            this.data.verified[guildId] = {};
        }
        this.data.verified[guildId][userId] = true;
        await this.save();
    }

    isVerified(guildId, userId) {
        return this.data.verified[guildId]?.[userId] || false;
    }

    async unverifyUser(guildId, userId) {
        if (this.data.verified[guildId]?.[userId]) {
            delete this.data.verified[guildId][userId];
            await this.save();
        }
    }

    getVerifiedUsers(guildId) {
        return Object.keys(this.data.verified[guildId] || {});
    }

    cleanupJoinLog() {
        const now = Date.now();
        const maxAge = 60000; // Keep logs for 1 minute

        for (const guildId in this.data.joinLog) {
            this.data.joinLog[guildId] = this.data.joinLog[guildId].filter(
                log => now - log.timestamp < maxAge
            );
        }
    }

    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

module.exports = new RaidProtectionManager();
