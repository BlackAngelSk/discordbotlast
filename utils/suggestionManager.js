const fs = require('fs').promises;
const path = require('path');

class SuggestionManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'suggestions.json');
        this.data = {
            settings: {}, // { guildId: { channelId, staffRoleId, enabled } }
            suggestions: {} // { guildId: { suggestionId: { userId, content, status, votes, messageId } } }
        };
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading suggestions:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving suggestions:', error);
        }
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                channelId: null,
                staffRoleId: null,
                enabled: false,
                autoThread: true,
                votingEnabled: true
            };
        }
        return this.data.settings[guildId];
    }

    async updateSettings(guildId, settings) {
        this.data.settings[guildId] = { ...this.getSettings(guildId), ...settings };
        await this.save();
    }

    async createSuggestion(guildId, userId, content, messageId) {
        if (!this.data.suggestions[guildId]) {
            this.data.suggestions[guildId] = {};
        }

        const suggestionId = `${guildId}_${Date.now()}`;
        this.data.suggestions[guildId][suggestionId] = {
            id: suggestionId,
            userId,
            content,
            status: 'pending',
            messageId,
            upvotes: 0,
            downvotes: 0,
            voters: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await this.save();
        return suggestionId;
    }

    getSuggestion(guildId, suggestionId) {
        return this.data.suggestions[guildId]?.[suggestionId] || null;
    }

    async updateSuggestionStatus(guildId, suggestionId, status, reason = null) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (suggestion) {
            suggestion.status = status;
            suggestion.updatedAt = new Date().toISOString();
            if (reason) suggestion.reason = reason;
            await this.save();
            return true;
        }
        return false;
    }

    async addVote(guildId, suggestionId, userId, voteType) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return false;

        // Remove previous vote if exists
        const existingVoteIndex = suggestion.voters.findIndex(v => v.userId === userId);
        if (existingVoteIndex !== -1) {
            const oldVote = suggestion.voters[existingVoteIndex].type;
            if (oldVote === 'up') suggestion.upvotes--;
            else suggestion.downvotes--;
            suggestion.voters.splice(existingVoteIndex, 1);
        }

        // Add new vote
        if (voteType === 'up') {
            suggestion.upvotes++;
        } else {
            suggestion.downvotes++;
        }
        suggestion.voters.push({ userId, type: voteType });
        
        await this.save();
        return true;
    }

    getGuildSuggestions(guildId, status = null) {
        const suggestions = this.data.suggestions[guildId] || {};
        const suggestionList = Object.values(suggestions);
        
        if (status) {
            return suggestionList.filter(s => s.status === status);
        }
        return suggestionList;
    }

    async deleteSuggestion(guildId, suggestionId) {
        if (this.data.suggestions[guildId]?.[suggestionId]) {
            delete this.data.suggestions[guildId][suggestionId];
            await this.save();
            return true;
        }
        return false;
    }
}

module.exports = new SuggestionManager();
