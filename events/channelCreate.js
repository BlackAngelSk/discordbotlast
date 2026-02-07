const { Events } = require('discord.js');
const loggingManager = require('../utils/loggingManager');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel, client) {
        try {
            // Ignore DMs
            if (!channel.guild) return;

            loggingManager.logChannelCreate(channel, client);
        } catch (error) {
            console.error('Error in channelCreate event:', error);
        }
    }
};
