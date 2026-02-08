const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock paper scissors and bet your coins!')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10)),
    
    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }
            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);
            await playRPSWithBet(interaction, bet);
        } catch (error) {
            console.error('Error in rps command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing rock paper scissors!', ephemeral: true });
            }
        }
    }
};

async function playRPSWithBet(interaction, bet) {
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };

    const gameEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription(`Choose your move! (Bet: ${bet} coins)`)
        .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(interaction.guild.id, interaction.user.id).balance}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock').setEmoji('🪨').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper').setEmoji('📄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({ embeds: [gameEmbed], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30_000, filter: i => i.user.id === interaction.user.id });

    collector.on('collect', async i => {
        const userChoice = i.customId.split('_')[1];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        
        let result, color, payout = 0;
        if (userChoice === botChoice) {
            result = "It's a tie!";
            color = 0xf1c40f;
            payout = bet;
            await gameStatsManager.recordRPS(interaction.user.id, 'tie');
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            result = 'You win!';
            color = 0x57f287;
            payout = bet * 2;
            await gameStatsManager.recordRPS(interaction.user.id, 'win');
        } else {
            result = 'You lose!';
            color = 0xed4245;
            await gameStatsManager.recordRPS(interaction.user.id, 'loss');
        }

        if (payout > 0) {
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        }

        const resultEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🎮 Rock Paper Scissors - Result')
            .addFields(
                { name: 'Your choice', value: `${emojis[userChoice]} ${userChoice}`, inline: true },
                { name: 'Bot choice', value: `${emojis[botChoice]} ${botChoice}`, inline: true },
                { name: 'Result', value: result, inline: false },
                { name: '💰 Payout', value: `${payout} coins`, inline: true }
            )
            .setFooter({ text: `Bet: ${bet} coins` });

        await i.update({ embeds: [resultEmbed], components: [] });
        collector.stop();
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, bet);
            await msg.edit({ content: '⏰ Game timed out. Bet refunded.', components: [] });
        }
    });
}
