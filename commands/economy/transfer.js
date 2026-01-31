const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'transfer',
    description: 'Send coins to another user',
    usage: '!transfer <@user> <amount>',
    aliases: ['send', 'give'],
    category: 'economy',
    async execute(message, args) {
        try {
            if (args.length < 2) {
                return message.reply('❌ Usage: `!transfer <@user> <amount>`\nExample: `!transfer @John 100`');
            }

            const recipient = message.mentions.users.first();
            if (!recipient) {
                return message.reply('❌ Please mention a user to send coins to!');
            }

            if (recipient.id === message.author.id) {
                return message.reply('❌ You cannot send coins to yourself!');
            }

            if (recipient.bot) {
                return message.reply('❌ You cannot send coins to bots!');
            }

            const amount = parseInt(args[1]);
            if (!amount || amount <= 0) {
                return message.reply('❌ Please specify a valid amount greater than 0!');
            }

            // Check if sender has enough money
            const senderData = economyManager.getUserData(message.guild.id, message.author.id);
            if (senderData.balance < amount) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${senderData.balance} coins`);
            }

            // Process transfer
            await economyManager.removeMoney(message.guild.id, message.author.id, amount);
            await economyManager.addMoney(message.guild.id, recipient.id, amount);

            // Send confirmation embed
            const transferEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💸 Coin Transfer Successful')
                .setDescription(`${message.author.tag} sent coins to ${recipient.tag}`)
                .addFields(
                    { name: 'From', value: message.author.tag, inline: true },
                    { name: 'To', value: recipient.tag, inline: true },
                    { name: 'Amount', value: `${amount} coins`, inline: true },
                    { name: 'Your New Balance', value: `${senderData.balance - amount} coins`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [transferEmbed] });

            // Try to DM the recipient
            try {
                const recipientData = economyManager.getUserData(message.guild.id, recipient.id);
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('💰 You Received Coins!')
                    .setDescription(`${message.author.tag} sent you coins in **${message.guild.name}**`)
                    .addFields(
                        { name: 'Amount', value: `${amount} coins`, inline: true },
                        { name: 'Your New Balance', value: `${recipientData.balance} coins`, inline: true }
                    )
                    .setTimestamp();

                await recipient.send({ embeds: [dmEmbed] });
            } catch (error) {
                // User has DMs disabled, silently fail
            }

        } catch (error) {
            console.error('Error in transfer command:', error);
            message.reply('❌ An error occurred while transferring coins!');
        }
    }
};
