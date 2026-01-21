const { Events } = require('discord.js');
const settingsManager = require('../utils/settingsManager');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member, client) {
        try {
            const settings = settingsManager.get(member.guild.id);

            // Check if leave messages are enabled
            if (!settings.leaveEnabled) {
                return;
            }

            // Get leave channel
            const channelId = settings.leaveChannel;
            if (!channelId) {
                return;
            }

            const channel = member.guild.channels.cache.get(channelId);
            if (!channel || !channel.isTextBased()) {
                console.log(`⚠️ Leave channel not found or not text-based in guild ${member.guild.name}`);
                return;
            }

            // Format leave message
            const leaveMessage = settings.leaveMessage
                .replace('{user}', member.user.username)
                .replace('{mention}', `<@${member.user.id}>`)
                .replace('{server}', member.guild.name)
                .replace('{memberCount}', member.guild.memberCount.toString());

            await channel.send(leaveMessage);
            console.log(`👋 ${member.user.tag} left ${member.guild.name}`);

        } catch (error) {
            console.error('Error in guildMemberRemove event:', error);
        }
    }
};
