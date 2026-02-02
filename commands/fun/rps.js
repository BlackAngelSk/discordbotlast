const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'rps',
    description: 'Play rock paper scissors and bet your coins!',
    usage: '!rps <bet>',
    aliases: ['rockpaperscissors', 'rpsbet'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0]);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!rps <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            // Play the game with betting
            await playRPSWithBet(message, bet);

        } catch (error) {
            console.error('Error in rps command:', error);
            message.reply('❌ An error occurred while playing rock paper scissors!');
        }
    }
};

async function playRPSWithBet(message, bet) {
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️'
    };

    const gameEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription(`Choose your move! (Bet: ${bet} coins)`)
        .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(message.guild.id, message.author.id).balance}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rps_rock')
            .setLabel('Rock')
            .setEmoji('🪨')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('rps_paper')
            .setLabel('Paper')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setLabel('Scissors')
            .setEmoji('✂️')
            .setStyle(ButtonStyle.Danger)
    );

    const gameMessage = await message.reply({ embeds: [gameEmbed], components: [row] });

    const collector = gameMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000,
        filter: (i) => i.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
        const userChoice = interaction.customId.replace('rps_', '');
        const botChoice = choices[Math.floor(Math.random() * choices.length)];

        let result = determineWinner(userChoice, botChoice);
        let payout = 0;
        let resultText = '';

        if (result === 'win') {
            payout = Math.floor(bet * 1.5); // 1.5x payout for winning
            resultText = `🎉 **You Won!** ${emojis[userChoice]} beats ${emojis[botChoice]}!\n\n+${payout} coins!`;
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
            await gameStatsManager.recordRPS(message.author.id, 'win');
        } else if (result === 'tie') {
            payout = bet; // Return the bet
            resultText = `🤝 **It's a Tie!** You both chose ${emojis[userChoice]}!\n\nReturned: ${payout} coins`;
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
            await gameStatsManager.recordRPS(message.author.id, 'tie');
        } else {
            resultText = `😢 **You Lost!** ${emojis[botChoice]} beats ${emojis[userChoice]}!\n\n-${bet} coins`;
            await gameStatsManager.recordRPS(message.author.id, 'loss');
        }

        const resultEmbed = new EmbedBuilder()
            .setColor(result === 'win' ? 0x57f287 : result === 'tie' ? 0xfaa61a : 0xed4245)
            .setTitle('🎮 Rock Paper Scissors')
            .setDescription(resultText)
            .addFields(
                { name: 'Your Choice', value: `${emojis[userChoice]} ${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}`, inline: true },
                { name: 'Bot Choice', value: `${emojis[botChoice]} ${botChoice.charAt(0).toUpperCase() + botChoice.slice(1)}`, inline: true },
                { name: 'New Balance', value: `💰 ${economyManager.getUserData(message.guild.id, message.author.id).balance} coins`, inline: false }
            )
            .setFooter({ text: 'Thanks for playing!' });

        await interaction.update({ embeds: [resultEmbed], components: [] });
        collector.stop();
    });

    collector.on('end', (collected) => {
        if (collected.size === 0) {
            message.reply('❌ You didn\'t make a choice in time! Your bet has been forfeited.');
        }
    });
}

function determineWinner(userChoice, botChoice) {
    if (userChoice === botChoice) return 'tie';

    if (userChoice === 'rock' && botChoice === 'scissors') return 'win';
    if (userChoice === 'paper' && botChoice === 'rock') return 'win';
    if (userChoice === 'scissors' && botChoice === 'paper') return 'win';

    return 'lose';
}
