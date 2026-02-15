/**
 * Enhanced AI Manager
 * Advanced AI chat responses and smart moderation suggestions
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

class AIManager {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        this.conversationHistory = new Map();
        this.dataFile = path.join(__dirname, '..', 'data', 'ai.json');
    }

    async init() {
        try {
            await fs.access(this.dataFile);
        } catch {
            await fs.writeFile(this.dataFile, JSON.stringify({
                conversations: {},
                moderationSuggestions: {},
                preferences: {}
            }, null, 2));
        }
    }

    async generateResponse(userId, message, context = '') {
        try {
            const prompt = context ? 
                `Context: ${context}\n\nUser: ${message}` : 
                message;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            // Store conversation
            if (!this.conversationHistory.has(userId)) {
                this.conversationHistory.set(userId, []);
            }
            this.conversationHistory.get(userId).push({
                user: message,
                bot: response,
                timestamp: new Date()
            });

            // Keep only last 10 messages for context
            if (this.conversationHistory.get(userId).length > 10) {
                this.conversationHistory.get(userId).shift();
            }

            return response;
        } catch (error) {
            console.error('AI generation error:', error);
            return 'Sorry, I had trouble understanding that. Please try again.';
        }
    }

    async smartModerationSuggestion(violation) {
        try {
            const prompt = `As a Discord moderation assistant, suggest appropriate actions for this violation: ${violation.type} by user ${violation.userId}. Context: ${violation.context}. Provide JSON with suggested action (warn/mute/kick/ban), duration, and reason.`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            try {
                // Try to parse JSON from response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                // Return structured response if parsing fails
                return {
                    action: 'warn',
                    duration: 0,
                    reason: response
                };
            }

            return {
                action: 'warn',
                duration: 0,
                reason: response
            };
        } catch (error) {
            console.error('Moderation suggestion error:', error);
            return {
                action: 'warn',
                duration: 0,
                reason: 'Unable to generate suggestion'
            };
        }
    }

    async analyzeContent(content) {
        try {
            const prompt = `Analyze this Discord message for potentially harmful content. Return JSON with: toxicity (0-1), categories (array), isSafe (boolean), explanation (string). Content: "${content}"`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                // Default safe response
            }

            return {
                toxicity: 0,
                categories: [],
                isSafe: true,
                explanation: 'Unable to analyze'
            };
        } catch (error) {
            console.error('Content analysis error:', error);
            return {
                toxicity: 0,
                categories: [],
                isSafe: true,
                explanation: 'Analysis failed'
            };
        }
    }

    async generateServerInsights(guildId, serverData) {
        try {
            const prompt = `Analyze these Discord server metrics and provide insights: Members: ${serverData.memberCount}, Messages today: ${serverData.messagesCount}, Top commands: ${serverData.topCommands?.join(', ')}. Provide actionable suggestions for server improvement.`;

            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('Server insights error:', error);
            return 'Unable to generate insights at this time.';
        }
    }

    async suggestCustomCommands(serverType) {
        try {
            const prompt = `Suggest 5 useful custom Discord bot commands for a ${serverType} server. Return as JSON array with name, description, and example usage.`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            try {
                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                // Return empty array if parsing fails
            }

            return [];
        } catch (error) {
            console.error('Command suggestion error:', error);
            return [];
        }
    }

    getConversationHistory(userId) {
        return this.conversationHistory.get(userId) || [];
    }

    clearConversationHistory(userId) {
        this.conversationHistory.delete(userId);
    }

    async saveModerationSuggestion(guildId, suggestion) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data.moderationSuggestions[guildId]) {
            data.moderationSuggestions[guildId] = [];
        }

        data.moderationSuggestions[guildId].push({
            ...suggestion,
            timestamp: new Date()
        });

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async setAIPreference(userId, preference, value) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data.preferences[userId]) {
            data.preferences[userId] = {};
        }

        data.preferences[userId][preference] = value;

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    }

    async getAIPreference(userId, preference) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        return data.preferences[userId]?.[preference] ?? null;
    }
}

module.exports = new AIManager();
