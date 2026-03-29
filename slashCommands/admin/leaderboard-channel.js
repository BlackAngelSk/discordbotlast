const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');
const seasonManager = require('../../utils/seasonManager');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-channel')
        .setDescription('Set the channel for season leaderboard updates')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to post leaderboards')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('interval')
                .setDescription('Update interval in minutes (min 5)')
                .setMinValue(5)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('compact')
                .setDescription('Compact mode (Top 3 only)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role allowed to force-update leaderboards')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need "Administrator" permission!',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = interaction.options.getChannel('channel');
            const interval = interaction.options.getInteger('interval');
            const compact = interaction.options.getBoolean('compact');
            const role = interaction.options.getRole('role');

            if (!channel.isTextBased()) {
                return interaction.reply({
                    content: '❌ Please select a text channel!',
                    flags: MessageFlags.Ephemeral
                });
            }

            await seasonLeaderboardManager.setLeaderboardChannel(interaction.guildId, channel.id);
            await seasonLeaderboardManager.setLeaderboardOptions(interaction.guildId, {
                updateIntervalMinutes: interval ?? undefined,
                compactMode: compact ?? undefined,
                allowedRoleId: role?.id ?? undefined
            });

            const balanceTop = compact ? 'Top 3' : 'Top 10';
            const gamblingTop = compact ? 'Top 3' : 'Top 5';

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Leaderboard Channel Set')
                .setDescription(`Leaderboards will be posted in ${channel}`)
                .addFields(
                    { name: '📍 Channel', value: channel.toString(), inline: true },
                    { name: '🔄 Update Interval', value: `Every ${interval || 15} minutes`, inline: true },
                    { name: '🗜️ Compact Mode', value: compact ? 'Enabled (Top 3)' : 'Disabled (Top 10/5)', inline: true },
                    { name: '🔐 Force Update Role', value: role ? role.toString() : 'Administrator only', inline: true },
                    { name: '📊 Economy Leaderboards', value: `💰 Season Balance (${balanceTop})`, inline: false },
                    { name: '🃏 Blackjack', value: `• Most Wins (${gamblingTop})\n• Best Win Rate (${gamblingTop})\n• Most Games (${gamblingTop})`, inline: true },
                    { name: '🎰 Roulette & Slots', value: `• Most Wins (${gamblingTop})\n• Best Win Rate (${gamblingTop})\n• Most Games (${gamblingTop})`, inline: true },
                    { name: '🎲 Dice', value: `• Most Wins (${gamblingTop})\n• Best Win Rate (${gamblingTop})\n• Most Games (${gamblingTop})`, inline: true },
                    { name: '🪙 Coinflip', value: `• Most Wins (${gamblingTop})\n• Best Win Rate (${gamblingTop})\n• Most Games (${gamblingTop})`, inline: true },
                    { name: '🎮 RPS & TTT', value: `• Most Wins (${gamblingTop})\n• Best Win Rate (${gamblingTop})\n• Most Games (${gamblingTop})`, inline: true },
                    { name: '📈 Total Content', value: compact ? '**9 Embeds** (1 Header + 1 Balance + 7 Gambling Stats)' : '**23 Embeds** (1 Header + 1 Balance + 21 Gambling Stats)', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in leaderboard-channel command:', error);
            interaction.reply({
                content: '❌ An error occurred!',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
