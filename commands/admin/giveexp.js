const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'giveexp',
    description: 'Give XP to a user (Admin only)',
    usage: '!giveexp @user <amount>',
    aliases: ['givexp', 'addexp'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const user = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!user) {
                return message.reply('❌ Please mention a user! Usage: `!giveexp @user <amount>`');
            }

            if (isNaN(amount) || amount <= 0) {
                return message.reply('❌ Please enter a valid amount!');
            }

            const result = await economyManager.addXP(message.guildId, user.id, amount);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('⭐ XP Given')
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'XP Added', value: `+${amount}`, inline: true },
                    { name: 'Level', value: `${result.level}`, inline: true },
                    { name: 'Leveled Up', value: result.leveledUp ? '✅ Yes' : '❌ No', inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in giveexp command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
