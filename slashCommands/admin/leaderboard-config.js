const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');
const seasonManager = require('../../utils/seasonManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-config')
        .setDescription('Configure season leaderboard settings')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View current leaderboard configuration'))
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Update leaderboard configuration')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable/disable leaderboard updates'))
                .addIntegerOption(option =>
                    option.setName('interval')
                        .setDescription('Update interval in minutes (min 5)')
                        .setMinValue(5))
                .addBooleanOption(option =>
                    option.setName('compact')
                        .setDescription('Compact mode (Top 3 only)'))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role allowed to force-update leaderboards'))
                .addIntegerOption(option =>
                    option.setName('prunedays')
                        .setDescription('Days of inactivity before pruning (0 disables)')
                        .setMinValue(0))
                .addIntegerOption(option =>
                    option.setName('payout1')
                        .setDescription('1st place payout amount'))
                .addIntegerOption(option =>
                    option.setName('payout2')
                        .setDescription('2nd place payout amount'))
                .addIntegerOption(option =>
                    option.setName('payout3')
                        .setDescription('3rd place payout amount'))
                .addRoleOption(option =>
                    option.setName('role1')
                        .setDescription('Role reward for 1st place'))
                .addRoleOption(option =>
                    option.setName('role2')
                        .setDescription('Role reward for 2nd place'))
                .addRoleOption(option =>
                    option.setName('role3')
                        .setDescription('Role reward for 3rd place')))
        .addSubcommand(sub =>
            sub.setName('export')
                .setDescription('Export current season leaderboard to CSV')),

    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need "Administrator" permission!',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guildId;
            const cfg = seasonLeaderboardManager.getGuildConfig(guildId);

            if (subcommand === 'view') {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('⚙️ Leaderboard Configuration')
                    .addFields(
                        { name: '✅ Enabled', value: cfg.enabled ? 'Yes' : 'No', inline: true },
                        { name: '🔄 Interval', value: `Every ${cfg.updateIntervalMinutes} minutes`, inline: true },
                        { name: '🗜️ Compact Mode', value: cfg.compactMode ? 'Enabled (Top 3)' : 'Disabled (Top 10/5)', inline: true },
                        { name: '🧹 Prune Days', value: `${cfg.pruneDays}`, inline: true },
                        { name: '🔐 Force Update Role', value: cfg.allowedRoleId ? `<@&${cfg.allowedRoleId}>` : 'Administrator only', inline: true },
                        { name: '💰 Payouts', value: (cfg.payouts || []).map((p, i) => `#${i + 1}: ${Number(p).toLocaleString()}`).join('\n') || 'None', inline: false },
                        { name: '🎖️ Reward Roles', value: (cfg.rewardRoles || []).map((r, i) => `#${i + 1}: <@&${r}>`).join('\n') || 'None', inline: false }
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'set') {
                const enabled = interaction.options.getBoolean('enabled');
                const interval = interaction.options.getInteger('interval');
                const compact = interaction.options.getBoolean('compact');
                const role = interaction.options.getRole('role');
                const pruneDays = interaction.options.getInteger('prunedays');
                const payout1 = interaction.options.getInteger('payout1');
                const payout2 = interaction.options.getInteger('payout2');
                const payout3 = interaction.options.getInteger('payout3');
                const role1 = interaction.options.getRole('role1');
                const role2 = interaction.options.getRole('role2');
                const role3 = interaction.options.getRole('role3');

                const payouts = [payout1, payout2, payout3].filter(v => typeof v === 'number');
                const rewardRoles = [role1?.id, role2?.id, role3?.id].filter(Boolean);

                await seasonLeaderboardManager.setLeaderboardOptions(guildId, {
                    enabled: enabled ?? undefined,
                    updateIntervalMinutes: interval ?? undefined,
                    compactMode: compact ?? undefined,
                    allowedRoleId: role?.id ?? undefined,
                    pruneDays: pruneDays ?? undefined,
                    payouts: payouts.length ? payouts : undefined,
                    rewardRoles: rewardRoles.length ? rewardRoles : undefined
                });

                const updated = seasonLeaderboardManager.getGuildConfig(guildId);

                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Leaderboard Configuration Updated')
                    .addFields(
                        { name: '✅ Enabled', value: updated.enabled ? 'Yes' : 'No', inline: true },
                        { name: '🔄 Interval', value: `Every ${updated.updateIntervalMinutes} minutes`, inline: true },
                        { name: '🗜️ Compact Mode', value: updated.compactMode ? 'Enabled (Top 3)' : 'Disabled (Top 10/5)', inline: true },
                        { name: '🧹 Prune Days', value: `${updated.pruneDays}`, inline: true },
                        { name: '🔐 Force Update Role', value: updated.allowedRoleId ? `<@&${updated.allowedRoleId}>` : 'Administrator only', inline: true },
                        { name: '💰 Payouts', value: (updated.payouts || []).map((p, i) => `#${i + 1}: ${Number(p).toLocaleString()}`).join('\n') || 'None', inline: false },
                        { name: '🎖️ Reward Roles', value: (updated.rewardRoles || []).map((r, i) => `#${i + 1}: <@&${r}>`).join('\n') || 'None', inline: false }
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'export') {
                const seasonName = seasonManager.getCurrentSeason(guildId);
                if (!seasonName) {
                    return interaction.editReply({ content: '❌ No active season found!' });
                }

                const season = seasonManager.getSeason(guildId, seasonName);
                if (!season) {
                    return interaction.editReply({ content: '❌ Season not found!' });
                }

                const rows = Object.values(season.leaderboard || {});
                const header = ['userId', 'username', 'balance', 'xp', 'level', 'coins', 'lastUpdated'];
                const lines = [header.join(',')];

                for (const row of rows) {
                    const values = [
                        row.userId,
                        (row.username || 'Unknown').replace(/"/g, '""'),
                        row.balance || 0,
                        row.xp || 0,
                        row.level || 1,
                        row.coins || 0,
                        row.lastUpdated ? new Date(row.lastUpdated).toISOString() : ''
                    ];
                    lines.push(values.map(v => `"${v}"`).join(','));
                }

                const csv = lines.join('\n');
                const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `${seasonName}-leaderboard.csv` });

                return interaction.editReply({
                    content: `📤 Exported ${rows.length} players from **${seasonName}**.`,
                    files: [file]
                });
            }
        } catch (error) {
            console.error('Error in leaderboard-config command:', error);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content: '❌ An error occurred!' }).catch(() => null);
            }
            return interaction.reply({ content: '❌ An error occurred!', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
    }
};
