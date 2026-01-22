const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'lock',
    description: 'Lock a channel to prevent members from sending messages',
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
                SendMessages: false
            });

            message.channel.send('🔒 Channel has been locked. Members cannot send messages.');
        } catch (error) {
            console.error('Error locking channel:', error);
            message.reply('❌ Failed to lock the channel. Please try again.');
        }
    }
};
