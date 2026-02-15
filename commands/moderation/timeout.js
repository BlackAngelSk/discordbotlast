const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'timeout',
    description: 'Timeout (mute) a member',
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
            return message.reply('❌ Please mention a user. Usage: `!timeout @user <duration> [reason]`\nDuration: 1m, 5m, 10m, 1h, 1d');
        }

        // Prevent timing out users with higher roles
        if (!member.moderatable) {
            return message.reply('❌ I cannot timeout this user. They may have a higher role than me.');
        }

        // Prevent users from timing out themselves
        if (member.id === message.author.id) {
            return message.reply('❌ You cannot timeout yourself!');
        }
        // Prevent timing out bot owner
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && member.id === botOwnerId) {
            return message.reply('❌ Cannot timeout the bot owner! 🔑');
        }
        const duration = args[1];
        if (!duration) {
            return message.reply('❌ Please specify duration. Usage: `!timeout @user <duration> [reason]`\nExamples: 1m, 5m, 10m, 1h, 1d');
        }

        // Parse duration
        const match = duration.match(/^(\d+)([mhd])$/);
        if (!match) {
            return message.reply('❌ Invalid duration format. Use: 1m (minutes), 1h (hours), or 1d (days)');
        }

        const value = parseInt(match[1]);
        const unit = match[2];
        
        let milliseconds;
        switch (unit) {
            case 'm':
                milliseconds = value * 60 * 1000;
                break;
            case 'h':
                milliseconds = value * 60 * 60 * 1000;
                break;
            case 'd':
                milliseconds = value * 24 * 60 * 60 * 1000;
                break;
        }

        // Discord max timeout is 28 days
        if (milliseconds > 28 * 24 * 60 * 60 * 1000) {
            return message.reply('❌ Maximum timeout duration is 28 days.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';

        try {
            await member.timeout(milliseconds, reason);
            message.reply(`🔇 **${member.user.tag}** has been timed out for **${duration}**.\n**Reason:** ${reason}`);
        } catch (error) {
            console.error('Error timing out member:', error);
            message.reply('❌ Failed to timeout the member. Please try again.');
        }
    }
};
