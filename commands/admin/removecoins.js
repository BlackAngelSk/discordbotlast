const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'removecoins',
    description: 'Remove coins from a user (Admin only)',
    usage: '!removecoins @user <amount>',
    aliases: ['takecoin', 'removecoin'],
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
                return message.reply('❌ Please mention a user! Usage: `!removecoins @user <amount>`');
            }

            if (isNaN(amount) || amount <= 0) {
                return message.reply('❌ Please enter a valid amount!');
            }

            const result = await economyManager.removeMoney(message.guildId, user.id, amount);

            if (!result) {
                return message.reply(`❌ User doesn't have enough coins!`);
            }

            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('💸 Coins Removed')
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Amount', value: `-${amount} coins`, inline: true },
                    { name: 'Admin', value: `${message.author.username}`, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in removecoins command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
