const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'dice',
    description: 'Roll dice and bet your coins!',
    usage: '!dice <number 1-6> <bet>',
    aliases: ['roll', 'diceroll'],
    category: 'fun',
    async execute(message, args) {
        try {
            const guess = parseInt(args[0]);
            const bet = parseInt(args[1]);

            if (!guess || guess < 1 || guess > 6) {
                return message.reply('❌ Please pick a number between 1 and 6!\nUsage: `!dice <1-6> <bet>`');
            }

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!dice <1-6> <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            await playDice(message, guess, bet);

        } catch (error) {
            console.error('Error in dice command:', error);
            message.reply('❌ An error occurred while playing dice!');
        }
    }
};

async function playDice(message, userGuess, bet) {
    const diceEmojis = ['⚫', '🎲', '🎲', '🎲', '🎲', '🎲'];
    const result = Math.floor(Math.random() * 6) + 1;

    const loadingEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎲 Rolling Dice...')
        .setDescription(`Your guess: **${userGuess}**\nBet: **${bet} coins**`)
        .setImage('https://media.giphy.com/media/l0HlRy9x8FZo0XO1i/giphy.gif');

    const msg = await message.reply({ embeds: [loadingEmbed] });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const won = userGuess === result;
    let payout = 0;
    let multiplier = 0;

    if (won) {
        // Higher multiplier for correct guess
        multiplier = 6;
        payout = bet * multiplier;
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
    }

    await gameStatsManager.recordSlots(message.author.id, won);

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle('🎲 Dice Roll Result')
        .setDescription(won ? '🎉 **YOU WON!**' : '😢 **YOU LOST!**')
        .addFields(
            { name: 'Your Guess', value: `**${userGuess}** ${diceEmojis[userGuess]}`, inline: true },
            { name: 'Result', value: `**${result}** ${diceEmojis[result]}`, inline: true },
            { name: 'Bet', value: `**${bet} coins**`, inline: true },
            { name: 'Payout', value: won ? `**+${payout} coins** (${multiplier}x multiplier!)` : `**-${bet} coins**`, inline: true },
            { name: 'New Balance', value: `💰 **${economyManager.getUserData(message.guild.id, message.author.id).balance} coins**`, inline: true }
        )
        .setFooter({ text: 'Thanks for playing!' });

    await msg.edit({ embeds: [resultEmbed] });
}
