const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Roll dice and bet your coins!')
        .addIntegerOption(option =>
            option.setName('guess')
                .setDescription('Your guess (1-6)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(6))
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10)),
    
    async execute(interaction) {
        try {
            const guess = interaction.options.getInteger('guess');
            const bet = interaction.options.getInteger('bet');

            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }

            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);
            await playDice(interaction, guess, bet);

        } catch (error) {
            console.error('Error in dice command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing dice!', ephemeral: true });
            }
        }
    }
};

async function playDice(interaction, userGuess, bet) {
    const result = Math.floor(Math.random() * 6) + 1;

    const loadingEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎲 Rolling Dice...')
        .setDescription(`Your guess: **${userGuess}**\nBet: **${bet} coins**`);

    await interaction.reply({ embeds: [loadingEmbed] });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const won = userGuess === result;
    const payout = won ? bet * 5 : 0;

    if (won) {
        await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        await gameStatsManager.recordDice(interaction.user.id, 'win');
    } else {
        await gameStatsManager.recordDice(interaction.user.id, 'loss');
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(`🎲 Dice - ${won ? 'You Win!' : 'You Lose!'}`)
        .setDescription(`The dice rolled **${result}**!`)
        .addFields(
            { name: 'Your guess', value: `${userGuess}`, inline: true },
            { name: 'Result', value: `${result}`, inline: true },
            { name: '💰 Payout', value: `${payout} coins${won ? ' (5x)' : ''}`, inline: true }
        )
        .setFooter({ text: `Bet: ${bet} coins` });

    await interaction.editReply({ embeds: [resultEmbed] });
}
