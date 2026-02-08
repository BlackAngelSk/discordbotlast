const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin and bet your coins!')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                ))
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10)),
    
    async execute(interaction) {
        try {
            const choice = interaction.options.getString('choice');
            const bet = interaction.options.getInteger('bet');

            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }

            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);
            await playCoinflip(interaction, choice, bet);

        } catch (error) {
            console.error('Error in coinflip command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing coinflip!', ephemeral: true });
            }
        }
    }
};

async function playCoinflip(interaction, userChoice, bet) {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';

    const loadingEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🪙 Flipping Coin...')
        .setDescription(`Your choice: **${userChoice.toUpperCase()}**\nBet: **${bet} coins**`);

    await interaction.reply({ embeds: [loadingEmbed] });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const won = userChoice === result;
    const payout = won ? Math.floor(bet * 2.5) : 0;

    if (won) {
        await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        await gameStatsManager.recordCoinflip(interaction.user.id, 'win');
    } else {
        await gameStatsManager.recordCoinflip(interaction.user.id, 'loss');
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(`🪙 Coinflip - ${won ? 'You Win!' : 'You Lose!'}`)
        .setDescription(`The coin landed on **${result.toUpperCase()}**!`)
        .addFields(
            { name: 'Your choice', value: userChoice.toUpperCase(), inline: true },
            { name: 'Result', value: result.toUpperCase(), inline: true },
            { name: '💰 Payout', value: `${payout} coins`, inline: true }
        )
        .setFooter({ text: `Bet: ${bet} coins` });

    await interaction.editReply({ embeds: [resultEmbed] });
}
