const { EmbedBuilder } = require('discord.js');
const moderationManager = require('../../utils/moderationManager');

module.exports = {
    name: 'resetwarnings',
    description: 'Clear warnings for a user (Admin only)',
    usage: '!resetwarnings @user',
    aliases: ['clearwarnings', 'removewarnings'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const user = message.mentions.users.first();

            if (!user) {
                return message.reply('❌ Please mention a user! Usage: `!resetwarnings @user`');
            }

            const warnings = moderationManager.getWarnings(message.guildId, user.id);

            if (warnings.length === 0) {
                return message.reply(`<@${user.id}> has no warnings!`);
            }

            // Clear warnings
            moderationManager.data.warnings[`${message.guildId}_${user.id}`] = [];
            await moderationManager.save();

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🗑️ Warnings Cleared')
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Warnings Removed', value: `${warnings.length}`, inline: true },
                    { name: 'Admin', value: `${message.author.username}`, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in resetwarnings command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
