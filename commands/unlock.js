const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'unlock',
    description: 'Unlock a channel to allow members to send messages',
    async execute(message, args, client) {
        // Check if user has manage channels permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ You need **Manage Channels** permission to use this command.');
        }

        // Check if bot has manage channels permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ I need **Manage Channels** permission to do that.');
        }

        const channel = message.channel;
        const everyone = message.guild.roles.everyone;

        try {
            await channel.permissionOverwrites.edit(everyone, {
                SendMessages: null
            });

            message.channel.send('🔓 Channel has been unlocked. Members can send messages again.');
        } catch (error) {
            console.error('Error unlocking channel:', error);
            message.reply('❌ Failed to unlock the channel. Please try again.');
        }
    }
};
