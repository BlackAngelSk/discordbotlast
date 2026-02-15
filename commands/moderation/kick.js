const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'kick',
    description: 'Kick a member from the server',
    async execute(message, args, client) {
        // Check if user has kick permissions
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply('❌ You need **Kick Members** permission to use this command.');
        }

        // Check if bot has kick permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply('❌ I need **Kick Members** permission to do that.');
        }

        const member = message.mentions.members.first();
        if (!member) {
            return message.reply('❌ Please mention a user to kick. Usage: `!kick @user [reason]`');
        }

        // Prevent kicking the bot owner or users with higher roles
        if (!member.kickable) {
            return message.reply('❌ I cannot kick this user. They may have a higher role than me.');
        }

        // Prevent users from kicking themselves
        if (member.id === message.author.id) {
            return message.reply('❌ You cannot kick yourself!');
        }

        // Prevent kicking bot owner
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && member.id === botOwnerId) {
            return message.reply('❌ Cannot kick the bot owner! 🔑');
        }

        // Get reason
        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** has been kicked.\n**Reason:** ${reason}`);
        } catch (error) {
            console.error('Error kicking member:', error);
            message.reply('❌ Failed to kick the member. Please try again.');
        }
    }
};
