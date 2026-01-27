const fs = require('fs').promises;
const path = require('path');

class ModerationManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'moderation.json');
        this.data = {
            warnings: {},
            modLogs: {},
            automod: {}
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
                console.error('Error loading moderation data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving moderation data:', error);
        }
    }

    async addWarning(guildId, userId, moderatorId, reason) {
        const key = `${guildId}_${userId}`;
        if (!this.data.warnings[key]) {
            this.data.warnings[key] = [];
        }

        const warning = {
            id: Date.now(),
            moderatorId,
            reason,
            timestamp: new Date().toISOString()
        };

        this.data.warnings[key].push(warning);
        await this.save();
        return warning;
    }

    getWarnings(guildId, userId) {
        const key = `${guildId}_${userId}`;
        return this.data.warnings[key] || [];
    }

    async clearWarnings(guildId, userId) {
        const key = `${guildId}_${userId}`;
        this.data.warnings[key] = [];
        await this.save();
    }

    async removeWarning(guildId, userId, warningId) {
        const key = `${guildId}_${userId}`;
        if (!this.data.warnings[key]) return false;

        const index = this.data.warnings[key].findIndex(w => w.id === warningId);
        if (index === -1) return false;

        this.data.warnings[key].splice(index, 1);
        await this.save();
        return true;
    }

    setModLogChannel(guildId, channelId) {
        this.data.modLogs[guildId] = channelId;
        this.save();
    }

    getModLogChannel(guildId) {
        return this.data.modLogs[guildId];
    }

    getAutomodSettings(guildId) {
        if (!this.data.automod[guildId]) {
            this.data.automod[guildId] = {
                enabled: false,
                antiSpam: true,
                antiInvite: true,
                badWords: [],
                maxMentions: 5,
                maxEmojis: 10
            };
        }
        return this.data.automod[guildId];
    }

    async updateAutomodSettings(guildId, settings) {
        this.data.automod[guildId] = {
            ...this.getAutomodSettings(guildId),
            ...settings
        };
        await this.save();
    }

    checkMessage(guildId, content, mentions) {
        const settings = this.getAutomodSettings(guildId);
        if (!settings.enabled) return { violation: false };

        // Check for Discord invites
        if (settings.antiInvite && /discord\.gg\/|discord\.com\/invite\//i.test(content)) {
            return { violation: true, reason: 'Discord invite link detected' };
        }

        // Check for bad words
        if (settings.badWords.length > 0) {
            const lowerContent = content.toLowerCase();
            for (const word of settings.badWords) {
                if (lowerContent.includes(word.toLowerCase())) {
                    return { violation: true, reason: 'Inappropriate language detected' };
                }
            }
        }

        // Check for excessive mentions
        if (mentions > settings.maxMentions) {
            return { violation: true, reason: `Excessive mentions (max ${settings.maxMentions})` };
        }

        // Check for excessive emojis
        const emojiCount = (content.match(/<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu) || []).length;
        if (emojiCount > settings.maxEmojis) {
            return { violation: true, reason: `Excessive emojis (max ${settings.maxEmojis})` };
        }

        return { violation: false };
    }
}

module.exports = new ModerationManager();
