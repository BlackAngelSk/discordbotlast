const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'Ban a member from the server',
    async execute(message, args, client) {
        // Check if user has ban permissions
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ You need **Ban Members** permission to use this command.');
        }

        // Check if bot has ban permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ I need **Ban Members** permission to do that.');
        }

        const member = message.mentions.members.first();
        if (!member) {
            return message.reply('❌ Please mention a user to ban. Usage: `!ban @user [reason]`');
        }

        // Prevent banning users with higher roles
        if (!member.bannable) {
            return message.reply('❌ I cannot ban this user. They may have a higher role than me.');
        }

        // Prevent users from banning themselves
        if (member.id === message.author.id) {
            return message.reply('❌ You cannot ban yourself!');
        }

        // Get reason
        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
            await member.ban({ reason: reason });
            message.reply(`🔨 **${member.user.tag}** has been banned.\n**Reason:** ${reason}`);
        } catch (error) {
            console.error('Error banning member:', error);
            message.reply('❌ Failed to ban the member. Please try again.');
        }
    }
};
