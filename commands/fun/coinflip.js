const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'coinflip',
    description: 'Flip a coin and bet your coins!',
    usage: '!coinflip <heads/tails> <bet>',
    aliases: ['flip', 'coin'],
    category: 'fun',
    async execute(message, args) {
        try {
            const choice = args[0]?.toLowerCase();
            const bet = parseInt(args[1]);

            if (!choice || !['heads', 'tails', 'h', 't'].includes(choice)) {
                return message.reply('❌ Please specify heads or tails!\nUsage: `!coinflip <heads/tails> <bet>`');
            }

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!coinflip <heads/tails> <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            await playCoinflip(message, choice, bet);

        } catch (error) {
            console.error('Error in coinflip command:', error);
            message.reply('❌ An error occurred while playing coinflip!');
        }
    }
};

async function playCoinflip(message, userChoice, bet) {
    const normalizedChoice = userChoice.startsWith('h') ? 'heads' : 'tails';
    const result = Math.random() < 0.5 ? 'heads' : 'tails';

    const loadingEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🪙 Flipping Coin...')
        .setDescription(`Your choice: **${normalizedChoice.toUpperCase()}**\nBet: **${bet} coins**`);

    const msg = await message.reply({ embeds: [loadingEmbed] });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const won = normalizedChoice === result;
    const payout = won ? Math.floor(bet * 2.5) : 0; // 2.5x payout for winning

    if (won) {
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
    }

    await gameStatsManager.recordCoinflip(message.author.id, won);

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle('🪙 Coin Flip Result')
        .setDescription(won ? '🎉 **YOU WON!**' : '😢 **YOU LOST!**')
        .addFields(
            { name: 'Your Choice', value: `**${normalizedChoice.toUpperCase()}**`, inline: true },
            { name: 'Result', value: `**${result.toUpperCase()}**`, inline: true },
            { name: 'Bet', value: `**${bet} coins**`, inline: true },
            { name: 'Payout', value: won ? `**+${payout} coins** (2.5x multiplier!)` : `**-${bet} coins**`, inline: true },
            { name: 'New Balance', value: `💰 **${economyManager.getUserData(message.guild.id, message.author.id).balance} coins**`, inline: true }
        )
        .setFooter({ text: 'Thanks for playing!' });

    await msg.edit({ embeds: [resultEmbed] });
}
