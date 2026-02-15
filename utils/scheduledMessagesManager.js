const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ScheduledMessagesManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'scheduledMessages.json');
        this.data = {
            messages: {} // { guildId: { messageId: { channelId, content, schedule, lastSent, enabled } } }
        };
        this.client = null;
        this.intervals = new Map();
    }

    async init(client = null) {
        if (client) this.client = client;

        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading scheduled messages:', error);
            }
        }

        // Start all active schedules
        if (this.client) {
            this.startAllSchedules();
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving scheduled messages:', error);
        }
    }

    async createScheduledMessage(guildId, channelId, content, schedule) {
        if (!this.data.messages[guildId]) {
            this.data.messages[guildId] = {};
        }

        const messageId = `${guildId}_${Date.now()}`;
        this.data.messages[guildId][messageId] = {
            id: messageId,
            channelId,
            content,
            schedule, // { type: 'interval', value: hours } or { type: 'cron', value: '0 12 * * *' }
            lastSent: null,
            enabled: true,
            createdAt: new Date().toISOString()
        };

        await this.save();

        // Start the schedule
        if (this.client) {
            this.startSchedule(guildId, messageId);
        }

        return messageId;
    }

    async deleteScheduledMessage(guildId, messageId) {
        if (this.data.messages[guildId]?.[messageId]) {
            // Stop the interval
            this.stopSchedule(messageId);
            
            delete this.data.messages[guildId][messageId];
            await this.save();
            return true;
        }
        return false;
    }

    async toggleScheduledMessage(guildId, messageId, enabled) {
        const message = this.data.messages[guildId]?.[messageId];
        if (message) {
            message.enabled = enabled;
            await this.save();

            if (enabled) {
                this.startSchedule(guildId, messageId);
            } else {
                this.stopSchedule(messageId);
            }
            return true;
        }
        return false;
    }

    getGuildMessages(guildId) {
        return Object.values(this.data.messages[guildId] || {});
    }

    getMessage(guildId, messageId) {
        return this.data.messages[guildId]?.[messageId] || null;
    }

    startSchedule(guildId, messageId) {
        const message = this.getMessage(guildId, messageId);
        if (!message || !message.enabled || !this.client) return;

        // Clear existing interval if any
        this.stopSchedule(messageId);

        const intervalMs = this.getIntervalMs(message.schedule);
        if (!intervalMs) return;

        const interval = setInterval(async () => {
            await this.sendScheduledMessage(guildId, messageId);
        }, intervalMs);

        this.intervals.set(messageId, interval);

        // Send immediately if never sent
        if (!message.lastSent) {
            this.sendScheduledMessage(guildId, messageId);
        }
    }

    stopSchedule(messageId) {
        const interval = this.intervals.get(messageId);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(messageId);
        }
    }

    startAllSchedules() {
        for (const guildId in this.data.messages) {
            for (const messageId in this.data.messages[guildId]) {
                const message = this.data.messages[guildId][messageId];
                if (message.enabled) {
                    this.startSchedule(guildId, messageId);
                }
            }
        }
    }

    stopAllSchedules() {
        for (const interval of this.intervals.values()) {
            clearInterval(interval);
        }
        this.intervals.clear();
    }

    async sendScheduledMessage(guildId, messageId) {
        const message = this.getMessage(guildId, messageId);
        if (!message || !this.client) return;

        try {
            const channel = await this.client.channels.fetch(message.channelId);
            if (!channel || !channel.isTextBased()) return;

            // Parse content for embeds
            if (message.content.startsWith('{') && message.content.includes('"embed"')) {
                try {
                    const data = JSON.parse(message.content);
                    if (data.embed) {
                        const embed = new EmbedBuilder(data.embed);
                        await channel.send({ embeds: [embed] });
                    } else {
                        await channel.send(data.content || message.content);
                    }
                } catch {
                    await channel.send(message.content);
                }
            } else {
                await channel.send(message.content);
            }

            // Update last sent time
            message.lastSent = new Date().toISOString();
            await this.save();

            console.log(`📅 Sent scheduled message ${messageId} in guild ${guildId}`);
        } catch (error) {
            console.error(`Error sending scheduled message ${messageId}:`, error);
        }
    }

    getIntervalMs(schedule) {
        if (schedule.type === 'interval') {
            return schedule.value * 60 * 60 * 1000; // Convert hours to ms
        }
        // For cron-style schedules, you'd need a cron parser library
        // For now, just support interval
        return null;
    }
}

module.exports = new ScheduledMessagesManager();
