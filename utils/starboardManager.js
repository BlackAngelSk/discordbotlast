const fs = require('fs').promises;
const path = require('path');

class StarboardManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'starboard.json');
        this.data = {};
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
                console.error('Error loading starboard data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving starboard data:', error);
        }
    }

    async addToStarboard(guildId, messageId, originalChannelId, starboardChannelId, message, starCount) {
        if (!this.data[guildId]) {
            this.data[guildId] = {};
        }

        this.data[guildId][messageId] = {
            originalChannelId,
            starboardChannelId,
            author: message.author.id,
            content: message.content,
            embeds: message.embeds,
            starCount,
            timestamp: new Date().toISOString()
        };

        await this.save();
    }

    async removeFromStarboard(guildId, messageId) {
        if (this.data[guildId]) {
            delete this.data[guildId][messageId];
            await this.save();
        }
    }

    isInStarboard(guildId, messageId) {
        return this.data[guildId] && this.data[guildId][messageId];
    }

    getStarboardEntry(guildId, messageId) {
        return this.data[guildId] ? this.data[guildId][messageId] : null;
    }
}

module.exports = new StarboardManager();
