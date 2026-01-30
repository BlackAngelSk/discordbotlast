const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

const getNumberColor = (number) => {
    if (number === 0) return '🟢 Green';
    if (redNumbers.includes(number)) return '🔴 Red';
    if (blackNumbers.includes(number)) return '⚫ Black';
    return 'Unknown';
};

module.exports = {
    name: 'roulette',
    description: 'Play roulette and bet your coins!',
    usage: '!roulette <bet>',
    aliases: ['rl', 'spin'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0]);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!roulette <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            // Play the game with betting
            await playRouletteWithBet(message, bet);

        } catch (error) {
            console.error('Error in roulette command:', error);
            message.reply('❌ An error occurred while playing roulette!');
        }
    }
};

async function playRouletteWithBet(message, bet) {
    const prompt = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎰 Roulette')
        .setDescription(`Place your bet of **${bet} coins**! Choose from the options below:`)
        .addFields(
            { name: 'Number Bet', value: 'Pick 0-36 (pays 35:1)', inline: true },
            { name: 'Color Bet', value: 'Red, Black or Green (0)', inline: true },
            { name: 'Other Bets', value: 'Odd/Even, High/Low (pays 1:1)', inline: true }
        )
        .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(message.guild.id, message.author.id).balance}` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('roulette_red')
            .setLabel('Red')
            .setEmoji('🔴')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('roulette_black')
            .setLabel('Black')
            .setEmoji('⚫')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('roulette_green')
            .setLabel('Green (0)')
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('roulette_odd')
            .setLabel('Odd')
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('roulette_even')
            .setLabel('Even')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('roulette_low')
            .setLabel('Low (1-18)')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('roulette_high')
            .setLabel('High (19-36)')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('roulette_number')
            .setLabel('Pick a Number')
            .setEmoji('🔢')
            .setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({ embeds: [prompt], components: [row1, row2] });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: interaction => interaction.user.id === message.author.id
    });

    collector.on('collect', async interaction => {
        const betType = interaction.customId.replace('roulette_', '');

        // If picking a number, ask for input
        if (betType === 'number') {
            await interaction.reply({
                content: '🔢 Reply with a number from **0 to 36**:',
                ephemeral: true
            });

            const numCollector = message.channel.createMessageCollector({
                filter: m => m.author.id === message.author.id,
                time: 30_000,
                max: 1
            });

            numCollector.on('collect', async m => {
                const chosenNum = parseInt(m.content.trim(), 10);
                if (Number.isNaN(chosenNum) || chosenNum < 0 || chosenNum > 36) {
                    return m.reply('❌ Invalid number! Must be 0-36.');
                }

                // Spin the wheel
                const result = Math.floor(Math.random() * 37);
                const color = getNumberColor(result);
                const won = result === chosenNum;

                await gameStatsManager.recordRoulette(message.author.id, won);

                const payout = won ? bet * 36 : 0;
                if (payout > 0) {
                    await economyManager.addMoney(message.guild.id, message.author.id, payout);
                }

                const resultEmbed = new EmbedBuilder()
                    .setColor(won ? 0x57f287 : 0xed4245)
                    .setTitle('🎰 Roulette - Result')
                    .setDescription(`The ball landed on: ${color} **${result}**`)
                    .addFields(
                        { name: 'Your Bet', value: `Number ${chosenNum}`, inline: true },
                        { name: 'Payout', value: won ? `${payout} coins (35:1) 🎉` : 'Lost 😅', inline: true },
                        { name: '💼 New Balance', value: `${economyManager.getUserData(message.guild.id, message.author.id).balance} coins`, inline: true }
                    )
                    .setFooter({ text: won ? 'Congratulations! 🎊' : 'Better luck next time! 🍀' });

                await msg.edit({ embeds: [resultEmbed], components: [] });
                collector.stop('finished');
            });

            return;
        }

        // Spin the wheel
        const result = Math.floor(Math.random() * 37);
        const color = getNumberColor(result);
        const isRed = redNumbers.includes(result);
        const isBlack = blackNumbers.includes(result);
        const isOdd = result !== 0 && result % 2 === 1;
        const isEven = result !== 0 && result % 2 === 0;
        const isLow = result >= 1 && result <= 18;
        const isHigh = result >= 19 && result <= 36;

        let won = false;
        let betDescription = '';
        let payout = 0;
        let multiplier = '1:1';

        switch (betType) {
            case 'red':
                won = isRed;
                betDescription = '🔴 Red';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
            case 'black':
                won = isBlack;
                betDescription = '⚫ Black';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
            case 'green':
                won = result === 0;
                betDescription = '🟢 Green (0)';
                payout = won ? bet * 36 : 0;
                multiplier = '35:1';
                break;
            case 'odd':
                won = isOdd;
                betDescription = 'Odd';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
            case 'even':
                won = isEven;
                betDescription = 'Even';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
            case 'low':
                won = isLow;
                betDescription = 'Low (1-18)';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
            case 'high':
                won = isHigh;
                betDescription = 'High (19-36)';
                payout = won ? bet * 2 : 0;
                multiplier = '1:1';
                break;
        }

        await gameStatsManager.recordRoulette(message.author.id, won);

        if (payout > 0) {
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
        }

        const resultEmbed = new EmbedBuilder()
            .setColor(won ? 0x57f287 : 0xed4245)
            .setTitle('🎰 Roulette - Result')
            .setDescription(`The ball landed on: ${color} **${result}**`)
            .addFields(
                { name: 'Your Bet', value: betDescription, inline: true },
                { name: 'Result', value: won ? `${payout} coins (${multiplier}) 🎉` : 'Lost 😅', inline: true },
                { name: '💼 New Balance', value: `${economyManager.getUserData(message.guild.id, message.author.id).balance} coins`, inline: true }
            )
            .setFooter({ text: won ? 'Congratulations! 🎊' : 'Better luck next time! 🍀' });

        await interaction.update({ embeds: [resultEmbed], components: [] });
        collector.stop('finished');
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await msg.edit({ content: '⏰ Roulette timed out.', components: [] });
        }
    });
}
