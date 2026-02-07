const { Events } = require('discord.js');
const loggingManager = require('../utils/loggingManager');

module.exports = {
    name: Events.MessageDelete,
    async execute(message, client) {
        try {
            // Ignore DMs
            if (!message.guild) return;

            loggingManager.logMessageDelete(message, client);
        } catch (error) {
            console.error('Error in messageDelete event:', error);
        }
    }
};
