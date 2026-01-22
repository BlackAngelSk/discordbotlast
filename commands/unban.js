const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'unban',
    description: 'Unban a user from the server',
    async execute(message, args, client) {
        // Check if user has ban permissions
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ You need **Ban Members** permission to use this command.');
        }

        // Check if bot has ban permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ I need **Ban Members** permission to do that.');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('❌ Please provide a user ID. Usage: `!unban <userId> [reason]`');
        }

        // Validate user ID format
        if (!/^\d{17,19}$/.test(userId)) {
            return message.reply('❌ Invalid user ID format.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
            await message.guild.members.unban(userId, reason);
            message.reply(`✅ User with ID **${userId}** has been unbanned.\n**Reason:** ${reason}`);
        } catch (error) {
            if (error.code === 10026) {
                message.reply('❌ This user is not banned.');
            } else {
                console.error('Error unbanning user:', error);
                message.reply('❌ Failed to unban the user. Please check the user ID and try again.');
            }
        }
    }
};
