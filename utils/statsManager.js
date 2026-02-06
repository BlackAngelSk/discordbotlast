const fs = require('fs').promises;
const path = require('path');

class StatsManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'stats.json');
        this.data = {
            servers: {},
            users: {}
        };
    }

    async init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading stats data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving stats data:', error);
        }
    }

    getServerStats(guildId) {
        if (!this.data.servers[guildId]) {
            this.data.servers[guildId] = {
                totalMessages: 0,
                totalMembers: 0,
                messagesPerDay: {},
                channelActivity: {}
            };
        }
        return this.data.servers[guildId];
    }

    getUserStats(guildId, userId) {
        const key = `${guildId}_${userId}`;
        if (!this.data.users[key]) {
            this.data.users[key] = {
                messages: 0,
                xp: 0,
                channelsActive: {},
                lastMessage: null
            };
        }
        return this.data.users[key];
    }

    async recordMessage(guildId, userId, channelId) {
        const serverStats = this.getServerStats(guildId);
        const userStats = this.getUserStats(guildId, userId);
        const today = new Date().toISOString().split('T')[0];

        serverStats.totalMessages++;
        serverStats.messagesPerDay[today] = (serverStats.messagesPerDay[today] || 0) + 1;
        serverStats.channelActivity[channelId] = (serverStats.channelActivity[channelId] || 0) + 1;

        userStats.messages++;
        userStats.channelsActive[channelId] = (userStats.channelsActive[channelId] || 0) + 1;
        userStats.lastMessage = Date.now();

        await this.save();
    }

    async recordMemberUpdate(guildId, memberCount) {
        const serverStats = this.getServerStats(guildId);
        serverStats.totalMembers = memberCount;
        await this.save();
    }

    getTopChannels(guildId, limit = 5) {
        const serverStats = this.getServerStats(guildId);
        return Object.entries(serverStats.channelActivity)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([channelId, messages]) => ({ channelId, messages }));
    }

    getTopUsers(guildId, limit = 10) {
        const guildUsers = Object.entries(this.data.users)
            .filter(([key]) => key.startsWith(`${guildId}_`))
            .map(([key, data]) => ({
                userId: key.split('_')[1],
                ...data
            }))
            .sort((a, b) => b.messages - a.messages)
            .slice(0, limit);
        
        return guildUsers;
    }

    getActivityTrend(guildId, days = 7) {
        const serverStats = this.getServerStats(guildId);
        const trend = {};
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            trend[dateStr] = serverStats.messagesPerDay[dateStr] || 0;
        }

        return trend;
    }
}

module.exports = new StatsManager();
