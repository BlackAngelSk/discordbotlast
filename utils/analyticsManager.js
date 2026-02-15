/**
 * Analytics Manager
 * Tracks server activity, command usage, member engagement
 */

const databaseManager = require('./databaseManager');
const fs = require('fs').promises;
const path = require('path');

class AnalyticsManager {
    constructor() {
        this.dataFile = path.join(__dirname, '..', 'data', 'analytics.json');
    }

    async init() {
        try {
            await fs.access(this.dataFile);
        } catch {
            await fs.writeFile(this.dataFile, JSON.stringify({ 
                servers: {},
                commands: {},
                users: {},
                events: []
            }, null, 2));
        }
    }

    async trackCommand(guildId, userId, command, success = true) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        // Initialize if needed
        if (!data.commands[command]) data.commands[command] = { count: 0, success: 0, failed: 0 };
        if (!data.users[userId]) data.users[userId] = { commands: 0, lastActive: null };
        if (!data.servers[guildId]) data.servers[guildId] = { messages: 0, commands: 0, members: 0 };

        data.commands[command].count++;
        if (success) data.commands[command].success++;
        else data.commands[command].failed++;

        data.users[userId].commands++;
        data.users[userId].lastActive = new Date();

        data.servers[guildId].commands++;

        data.events.push({
            type: 'command_used',
            command,
            guildId,
            userId,
            success,
            timestamp: new Date()
        });

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async trackMessage(guildId, userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data.servers[guildId]) data.servers[guildId] = { messages: 0, commands: 0, members: 0 };
        if (!data.users[userId]) data.users[userId] = { commands: 0, lastActive: null };

        data.servers[guildId].messages++;
        data.users[userId].lastActive = new Date();

        data.events.push({
            type: 'message_sent',
            guildId,
            userId,
            timestamp: new Date()
        });

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async trackMemberJoin(guildId, userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data.servers[guildId]) data.servers[guildId] = { messages: 0, commands: 0, members: 0 };

        data.servers[guildId].members++;

        data.events.push({
            type: 'member_joined',
            guildId,
            userId,
            timestamp: new Date()
        });

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async getServerAnalytics(guildId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        const serverStats = data.servers[guildId] || { messages: 0, commands: 0, members: 0 };
        const serverEvents = data.events.filter(e => e.guildId === guildId);

        return {
            stats: serverStats,
            topCommands: this.getTopCommands(guildId, 5),
            recentActivity: serverEvents.slice(-20),
            engagement: this.calculateEngagement(guildId)
        };
    }

    async getCommandStats(command) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        return data.commands[command] || { count: 0, success: 0, failed: 0 };
    }

    async getUserStats(userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        const userEvents = data.events.filter(e => e.userId === userId);
        return {
            stats: data.users[userId] || { commands: 0, lastActive: null },
            activity: userEvents.slice(-10)
        };
    }

    getTopCommands(guildId, limit = 10) {
        // Return most used commands
        return Object.entries(this.commands || {})
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([cmd, stats]) => ({ command: cmd, ...stats }));
    }

    calculateEngagement(guildId) {
        // Placeholder for engagement calculation
        return {
            score: Math.random() * 100,
            trend: 'stable'
        };
    }

    async getDashboardData(guildId) {
        const serverAnalytics = await this.getServerAnalytics(guildId);
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        return {
            overview: serverAnalytics.stats,
            topCommands: serverAnalytics.topCommands,
            recentActivity: serverAnalytics.recentActivity,
            engagement: serverAnalytics.engagement,
            dailyActivity: this.calculateDailyActivity(data.events.filter(e => e.guildId === guildId))
        };
    }

    calculateDailyActivity(events) {
        const dailyData = {};
        events.forEach(event => {
            const date = new Date(event.timestamp).toLocaleDateString();
            dailyData[date] = (dailyData[date] || 0) + 1;
        });
        return dailyData;
    }
}

module.exports = new AnalyticsManager();
