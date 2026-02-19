const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'addcoins',
    description: 'Add coins to a user (Admin only)',
    usage: '!addcoins @user <amount>',
    aliases: ['givecoin', 'addcoin'],
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
                return message.reply('❌ Please mention a user! Usage: `!addcoins @user <amount>`');
            }

            if (isNaN(amount) || amount <= 0) {
                return message.reply('❌ Please enter a valid amount!');
            }

            await economyManager.addMoney(message.guildId, user.id, amount);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💰 Coins Added')
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Amount', value: `+${amount} coins`, inline: true },
                    { name: 'Admin', value: `${message.author.username}`, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in addcoins command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
