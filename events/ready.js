const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(readyClient) {
        console.log(`✅ Logged in as ${readyClient.user.tag}!`);
        console.log(`🤖 Bot is ready and serving ${readyClient.guilds.cache.size} servers`);
    }
};
