const fs = require('fs').promises;
const path = require('path');
const economyManager = require('./economyManager');

class VoiceRewardsManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'voiceRewards.json');
        this.data = {
            settings: {}, // { guildId: { enabled, xpPerMinute, coinsPerHour, minUsersRequired } }
            sessions: {}, // Active voice sessions { guildId: { userId: { channelId, joinedAt } } }
            stats: {} // { guildId: { userId: { totalMinutes, lastReward } } }
        };
        this.rewardInterval = null;
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
                console.error('Error loading voice rewards:', error);
            }
        }

        // Start reward interval (every minute)
        this.startRewardInterval();
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving voice rewards:', error);
        }
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                enabled: true,
                xpPerMinute: 5,
                coinsPerHour: 100,
                minUsersRequired: 2, // Prevent solo AFK farming
                afkChannelExcluded: true
            };
        }
        return this.data.settings[guildId];
    }

    async updateSettings(guildId, updates) {
        const settings = this.getSettings(guildId);
        Object.assign(settings, updates);
        await this.save();
    }

    async joinVoice(guildId, userId, channelId) {
        if (!this.data.sessions[guildId]) {
            this.data.sessions[guildId] = {};
        }

        this.data.sessions[guildId][userId] = {
            channelId,
            joinedAt: Date.now()
        };

        await this.save();
    }

    async leaveVoice(guildId, userId) {
        const session = this.data.sessions[guildId]?.[userId];
        if (session) {
            const duration = Date.now() - session.joinedAt;
            const minutes = Math.floor(duration / 60000);

            // Update stats
            if (!this.data.stats[guildId]) {
                this.data.stats[guildId] = {};
            }
            if (!this.data.stats[guildId][userId]) {
                this.data.stats[guildId][userId] = { totalMinutes: 0 };
            }
            this.data.stats[guildId][userId].totalMinutes += minutes;

            delete this.data.sessions[guildId][userId];
            await this.save();

            return { minutes, totalMinutes: this.data.stats[guildId][userId].totalMinutes };
        }
        return null;
    }

    getActiveSession(guildId, userId) {
        return this.data.sessions[guildId]?.[userId] || null;
    }

    getUserStats(guildId, userId) {
        return this.data.stats[guildId]?.[userId] || { totalMinutes: 0 };
    }

    getVoiceLeaderboard(guildId, limit = 10) {
        const stats = this.data.stats[guildId] || {};
        return Object.entries(stats)
            .map(([userId, data]) => ({ userId, totalMinutes: data.totalMinutes }))
            .sort((a, b) => b.totalMinutes - a.totalMinutes)
            .slice(0, limit);
    }

    startRewardInterval() {
        if (this.rewardInterval) return;

        // Check every minute for rewards
        this.rewardInterval = setInterval(async () => {
            await this.distributeRewards();
        }, 60000); // 1 minute
    }

    async distributeRewards() {
        const now = Date.now();

        for (const guildId in this.data.sessions) {
            const settings = this.getSettings(guildId);
            if (!settings.enabled) continue;

            const sessions = this.data.sessions[guildId];
            const channelUsers = {};

            // Group users by channel
            for (const userId in sessions) {
                const session = sessions[userId];
                if (!channelUsers[session.channelId]) {
                    channelUsers[session.channelId] = [];
                }
                channelUsers[session.channelId].push(userId);
            }

            // Distribute rewards
            for (const channelId in channelUsers) {
                const users = channelUsers[channelId];
                
                // Skip if below minimum users requirement
                if (users.length < settings.minUsersRequired) continue;

                for (const userId of users) {
                    const session = sessions[userId];
                    const minutesInVoice = Math.floor((now - session.joinedAt) / 60000);

                    // Only reward if been in voice for at least 1 minute
                    if (minutesInVoice >= 1) {
                        // Award XP
                        if (settings.xpPerMinute > 0) {
                            await economyManager.addXP(guildId, userId, settings.xpPerMinute);
                        }

                        // Award coins (per hour rate, distributed per minute)
                        if (settings.coinsPerHour > 0) {
                            const coinsToAdd = Math.floor(settings.coinsPerHour / 60);
                            await economyManager.addMoney(guildId, userId, coinsToAdd);
                        }

                        // Update last reward time
                        if (!this.data.stats[guildId]) {
                            this.data.stats[guildId] = {};
                        }
                        if (!this.data.stats[guildId][userId]) {
                            this.data.stats[guildId][userId] = { totalMinutes: 0 };
                        }
                        this.data.stats[guildId][userId].lastReward = now;
                    }
                }
            }
        }

        await this.save();
    }

    stop() {
        if (this.rewardInterval) {
            clearInterval(this.rewardInterval);
            this.rewardInterval = null;
        }
    }
}

module.exports = new VoiceRewardsManager();
