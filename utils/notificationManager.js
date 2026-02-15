/**
 * Notification Manager
 * Handles DM alerts, scheduled announcements, milestone celebrations
 */

const fs = require('fs').promises;
const path = require('path');

class NotificationManager {
    constructor(client) {
        this.client = client;
        this.dataFile = path.join(__dirname, '..', 'data', 'notifications.json');
        this.schedules = new Map();
    }

    async init() {
        try {
            await fs.access(this.dataFile);
        } catch {
            await fs.writeFile(this.dataFile, JSON.stringify({
                alerts: {},
                announcements: {},
                milestones: {}
            }, null, 2));
        }
        this.startScheduleChecker();
    }

    async sendDMAlert(userId, alert) {
        try {
            const user = await this.client.users.fetch(userId);
            await user.send({
                embeds: [{
                    color: alert.color || 0x5865F2,
                    title: alert.title,
                    description: alert.description,
                    timestamp: new Date(),
                    footer: { text: 'Discord Bot Notification' }
                }]
            });
            return true;
        } catch (error) {
            console.error('Failed to send DM alert:', error);
            return false;
        }
    }

    async scheduleAnnouncement(guildId, channelId, message, scheduledTime) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        const announcement = {
            id: Date.now().toString(),
            guildId,
            channelId,
            message,
            scheduledTime: new Date(scheduledTime),
            sent: false,
            createdAt: new Date()
        };

        if (!data.announcements[guildId]) data.announcements[guildId] = [];
        data.announcements[guildId].push(announcement);

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        
        this.scheduleTask(announcement);
        return announcement;
    }

    async cancelAnnouncement(announcementId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        for (const guildId in data.announcements) {
            data.announcements[guildId] = data.announcements[guildId].filter(a => a.id !== announcementId);
        }

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        
        if (this.schedules.has(announcementId)) {
            clearTimeout(this.schedules.get(announcementId));
            this.schedules.delete(announcementId);
        }

        return true;
    }

    scheduleTask(announcement) {
        const delay = new Date(announcement.scheduledTime).getTime() - Date.now();
        
        if (delay > 0) {
            const timeout = setTimeout(async () => {
                await this.sendAnnouncement(announcement);
                this.schedules.delete(announcement.id);
            }, delay);

            this.schedules.set(announcement.id, timeout);
        }
    }

    async sendAnnouncement(announcement) {
        try {
            const channel = await this.client.channels.fetch(announcement.channelId);
            await channel.send(announcement.message);

            const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
            for (const guildId in data.announcements) {
                const announcement_idx = data.announcements[guildId].findIndex(a => a.id === announcement.id);
                if (announcement_idx !== -1) {
                    data.announcements[guildId][announcement_idx].sent = true;
                }
            }
            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to send announcement:', error);
            return false;
        }
    }

    async celebrateMilestone(guildId, userId, milestone, reward) {
        try {
            const user = await this.client.users.fetch(userId);
            await user.send({
                embeds: [{
                    color: 0x57F287,
                    title: '🎉 Milestone Reached!',
                    description: `Congratulations! You've reached ${milestone}`,
                    fields: [
                        { name: 'Reward', value: reward.toString(), inline: false }
                    ],
                    timestamp: new Date()
                }]
            });

            const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
            if (!data.milestones[userId]) data.milestones[userId] = [];
            data.milestones[userId].push({
                guildId,
                milestone,
                reward,
                date: new Date()
            });

            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to celebrate milestone:', error);
            return false;
        }
    }

    startScheduleChecker() {
        setInterval(async () => {
            try {
                const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
                for (const guildId in data.announcements) {
                    for (const announcement of data.announcements[guildId]) {
                        if (!announcement.sent && new Date(announcement.scheduledTime) <= new Date()) {
                            await this.sendAnnouncement(announcement);
                        }
                    }
                }
            } catch (error) {
                console.error('Schedule checker error:', error);
            }
        }, 60000); // Check every minute
    }

    async getScheduledAnnouncements(guildId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        return data.announcements[guildId] || [];
    }

    async getUserMilestones(userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        return data.milestones[userId] || [];
    }
}

module.exports = NotificationManager;
