const { Events } = require('discord.js');
const loggingManager = require('../utils/loggingManager');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage, client) {
        try {
            // Ignore DMs
            if (!newMessage.guild) return;

            // Ignore if content is the same (embeds updating, etc)
            if (oldMessage.content === newMessage.content) return;

            loggingManager.logMessageEdit(oldMessage, newMessage, client);
        } catch (error) {
            console.error('Error in messageUpdate event:', error);
        }
    }
};
