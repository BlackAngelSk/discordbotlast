const { Events } = require('discord.js');
const loggingManager = require('../utils/loggingManager');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel, client) {
        try {
            // Ignore DMs
            if (!channel.guild) return;

            loggingManager.logChannelDelete(channel, client);
        } catch (error) {
            console.error('Error in channelDelete event:', error);
        }
    }
};
