const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'untimeout',
    description: 'Remove timeout from a member',
    async execute(message, args, client) {
        // Check if user has timeout permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('❌ You need **Timeout Members** permission to use this command.');
        }

        // Check if bot has timeout permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('❌ I need **Timeout Members** permission to do that.');
        }

        const member = message.mentions.members.first();
        if (!member) {
            return message.reply('❌ Please mention a user to remove timeout. Usage: `!untimeout @user`');
        }

        if (!member.isCommunicationDisabled()) {
            return message.reply('❌ This user is not timed out.');
        }

        try {
            await member.timeout(null);
            message.reply(`🔊 **${member.user.tag}** timeout has been removed.`);
        } catch (error) {
            console.error('Error removing timeout:', error);
            message.reply('❌ Failed to remove timeout. Please try again.');
        }
    }
};
