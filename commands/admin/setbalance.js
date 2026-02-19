const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'setbalance',
    description: 'Set a user\'s exact balance (Admin only)',
    usage: '!setbalance @user <amount>',
    aliases: ['balance'],
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
                return message.reply('❌ Please mention a user! Usage: `!setbalance @user <amount>`');
            }

            if (isNaN(amount) || amount < 0) {
                return message.reply('❌ Please enter a valid amount!');
            }

            const userData = economyManager.getUserData(message.guildId, user.id);
            const oldBalance = userData.balance;
            userData.balance = amount;
            await economyManager.save();

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('💰 Balance Set')
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Old Balance', value: `${oldBalance}`, inline: true },
                    { name: 'New Balance', value: `${amount}`, inline: true },
                    { name: 'Admin', value: `${message.author.username}`, inline: false }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in setbalance command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
