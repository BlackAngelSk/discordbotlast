const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(readyClient) {
        console.log(`✅ Logged in as ${readyClient.user.tag}!`);
        console.log(`🤖 Bot is ready and serving ${readyClient.guilds.cache.size} servers`);
        
        // Restart active giveaways
        try {
            const giveawayCommand = require('../commands/utility/giveaway');
            if (giveawayCommand.restartGiveaways) {
                await giveawayCommand.restartGiveaways(readyClient);
                console.log('✅ Active giveaways restarted');
            }
        } catch (error) {
            console.error('Error restarting giveaways:', error);
        }
    }
};
