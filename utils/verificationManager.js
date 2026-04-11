/**
 * Verification Manager
 * Stores per-guild verification settings and pending verifications.
 */
const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'data', 'verification.json');

class VerificationManager {
    constructor() {
        // { guildId: { channelId, roleId, message } }
        this.data = {};
    }

    async init() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    set(guildId, config) {
        this.data[guildId] = config;
        return this.save();
    }

    get(guildId) { return this.data[guildId] || null; }

    remove(guildId) {
        delete this.data[guildId];
        return this.save();
    }
}

module.exports = new VerificationManager();
