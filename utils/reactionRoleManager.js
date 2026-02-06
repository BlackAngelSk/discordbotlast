const fs = require('fs').promises;
const path = require('path');

class ReactionRoleManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'reactionroles.json');
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
                console.error('Error loading reaction roles data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving reaction roles data:', error);
        }
    }

    async addReactionRole(guildId, messageId, emoji, roleId) {
        const key = `${guildId}_${messageId}`;
        if (!this.data[key]) {
            this.data[key] = {};
        }
        this.data[key][emoji] = roleId;
        await this.save();
    }

    async removeReactionRole(guildId, messageId, emoji) {
        const key = `${guildId}_${messageId}`;
        if (this.data[key]) {
            delete this.data[key][emoji];
            if (Object.keys(this.data[key]).length === 0) {
                delete this.data[key];
            }
        }
        await this.save();
    }

    getReactionRoles(guildId, messageId) {
        const key = `${guildId}_${messageId}`;
        return this.data[key] || {};
    }

    getRoleForReaction(guildId, messageId, emoji) {
        const reactionRoles = this.getReactionRoles(guildId, messageId);
        return reactionRoles[emoji];
    }
}

module.exports = new ReactionRoleManager();
