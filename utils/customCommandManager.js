const fs = require('fs').promises;
const path = require('path');

class CustomCommandManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'customcommands.json');
        this.data = {};
    }

    async init() {
        try {
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading custom commands:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving custom commands:', error);
        }
    }

    async addCommand(guildId, name, response) {
        if (!this.data[guildId]) {
            this.data[guildId] = {};
        }
        this.data[guildId][name.toLowerCase()] = response;
        await this.save();
    }

    async removeCommand(guildId, name) {
        if (this.data[guildId]) {
            delete this.data[guildId][name.toLowerCase()];
            await this.save();
        }
    }

    getCommand(guildId, name) {
        return this.data[guildId] ? this.data[guildId][name.toLowerCase()] : null;
    }

    getCommands(guildId) {
        return this.data[guildId] || {};
    }
}

module.exports = new CustomCommandManager();
