const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const seasonManager = require('../../utils/seasonManager');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-channel')
        .setDescription('Set the channel for season leaderboard updates')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to post leaderboards')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need "Administrator" permission!',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('channel');

            if (!channel.isTextBased()) {
                return interaction.reply({
                    content: '❌ Please select a text channel!',
                    ephemeral: true
                });
            }

            await seasonLeaderboardManager.setLeaderboardChannel(interaction.guildId, channel.id);

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Leaderboard Channel Set')
                .setDescription(`Leaderboards will be posted in ${channel}`)
                .addFields(
                    { name: '📍 Channel', value: channel.toString(), inline: true },
                    { name: '🔄 Update Interval', value: 'Every 15 minutes', inline: true },
                    { name: '📊 Economy Leaderboards', value: '💰 Season Balance (Top 10)', inline: false },
                    { name: '🃏 Blackjack', value: '• Most Wins (Top 5)\n• Best Win Rate (Top 5)\n• Most Games (Top 5)', inline: true },
                    { name: '🎰 Roulette & Slots', value: '• Most Wins (Top 5)\n• Best Win Rate (Top 5)\n• Most Games (Top 5)', inline: true },
                    { name: '🎲 Dice', value: '• Most Wins (Top 5)\n• Best Win Rate (Top 5)\n• Most Games (Top 5)', inline: true },
                    { name: '🪙 Coinflip', value: '• Most Wins (Top 5)\n• Best Win Rate (Top 5)\n• Most Games (Top 5)', inline: true },
                    { name: '🎮 RPS & TTT', value: '• Most Wins (Top 5)\n• Best Win Rate (Top 5)\n• Most Games (Top 5)', inline: true },
                    { name: '📈 Total Content', value: '**23 Embeds** (1 Header + 1 Balance + 21 Gambling Stats)', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in leaderboard-channel command:', error);
            interaction.reply({
                content: '❌ An error occurred!',
                ephemeral: true
            });
        }
    }
};
