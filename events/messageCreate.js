const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Handled by command handler
        // This event is triggered but actual command processing
        // happens in the main index.js through the CommandHandler
    }
};
