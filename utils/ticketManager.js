const fs = require('fs').promises;
const path = require('path');

class TicketManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'tickets.json');
        this.data = {
            settings: {},
            tickets: {}
        };
    }

    async init() {
        try {
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading tickets data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving tickets data:', error);
        }
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                categoryId: null,
                logsChannelId: null,
                enabled: false
            };
        }
        return this.data.settings[guildId];
    }

    async setSettings(guildId, settings) {
        this.data.settings[guildId] = settings;
        await this.save();
    }

    async createTicket(guildId, userId, reason) {
        const ticketId = `${guildId}_${userId}_${Date.now()}`;
        
        if (!this.data.tickets[guildId]) {
            this.data.tickets[guildId] = {};
        }

        this.data.tickets[guildId][ticketId] = {
            userId,
            reason,
            status: 'open',
            createdAt: new Date().toISOString(),
            messages: []
        };

        await this.save();
        return ticketId;
    }

    async closeTicket(guildId, ticketId) {
        if (this.data.tickets[guildId] && this.data.tickets[guildId][ticketId]) {
            this.data.tickets[guildId][ticketId].status = 'closed';
            this.data.tickets[guildId][ticketId].closedAt = new Date().toISOString();
            await this.save();
            return true;
        }
        return false;
    }

    getTicket(guildId, ticketId) {
        return this.data.tickets[guildId] ? this.data.tickets[guildId][ticketId] : null;
    }

    getGuildTickets(guildId) {
        return this.data.tickets[guildId] || {};
    }
}

module.exports = new TicketManager();
