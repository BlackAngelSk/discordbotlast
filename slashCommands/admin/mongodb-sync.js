const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const databaseManager = require('../../utils/databaseManager');

function formatInterval(intervalMs) {
    const minutes = Number(intervalMs) / 60_000;
    return Number.isInteger(minutes) ? `${minutes} minute(s)` : `${minutes.toFixed(2)} minute(s)`;
}

function formatDiscordTime(isoString) {
    if (!isoString) return 'Not scheduled';
    const unix = Math.floor(new Date(isoString).getTime() / 1000);
    return Number.isFinite(unix) ? `<t:${unix}:F>\n(<t:${unix}:R>)` : 'Not scheduled';
}

function buildStatusEmbed(status) {
    const isMongoLive = status.isConnected && status.usingStorage === 'mongodb';

    const embed = new EmbedBuilder()
        .setColor(isMongoLive ? 0x57F287 : 0xFEE75C)
        .setTitle('🗂️ MongoDB Sync Settings')
        .setDescription(
            status.mode === 'manual'
                ? 'MongoDB updates only when you run `/mongodb-sync run`.'
                : `MongoDB updates automatically every **${formatInterval(status.intervalMs)}**.`
        )
        .addFields(
            { name: '⚙️ Mode', value: status.mode === 'manual' ? 'Manual only' : 'Automatic interval', inline: true },
            { name: '⏱️ Interval', value: formatInterval(status.intervalMs), inline: true },
            { name: '🗄️ Active Storage', value: status.usingStorage === 'mongodb' ? 'MongoDB' : 'JSON fallback', inline: true },
            { name: '🚀 Startup Sync', value: status.startupSync ? 'Enabled' : 'Disabled', inline: true },
            { name: '🛑 Shutdown Sync', value: status.shutdownSync ? 'Enabled' : 'Disabled', inline: true },
            { name: '🔌 Connection', value: status.isConnected ? 'Connected' : 'Not connected', inline: true },
            {
                name: '📅 Next Auto Sync',
                value: status.mode === 'manual' ? 'Manual mode — no automatic timer' : formatDiscordTime(status.nextAutoSyncAt),
                inline: false
            },
            {
                name: '🕓 Last Sync',
                value: status.lastSyncAt
                    ? `${formatDiscordTime(status.lastSyncAt)}\nReason: ${status.lastReason || 'unknown'} • Duration: ${status.lastSyncDurationMs || 0} ms`
                    : 'No sync has been recorded since startup.',
                inline: false
            }
        )
        .setTimestamp();

    if (status.lastResult?.failedCount > 0) {
        const details = status.lastResult.failures
            .slice(0, 5)
            .map((failure) => `• ${failure.file}: ${failure.reason}`)
            .join('\n');

        embed.addFields({
            name: '⚠️ Last Sync Issues',
            value: details.length > 1024 ? `${details.slice(0, 1000)}...` : details,
            inline: false
        });
    }

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mongodb-sync')
        .setDescription('Choose when MongoDB gets updated (Bot Owner Only)')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('run')
                .setDescription('Force sync JSON data to MongoDB now'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('View the current MongoDB sync schedule'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('schedule')
                .setDescription('Choose when MongoDB should update')
                .addStringOption((option) =>
                    option
                        .setName('mode')
                        .setDescription('Pick automatic updates or manual-only sync')
                        .addChoices(
                            { name: 'Automatic interval', value: 'interval' },
                            { name: 'Manual only', value: 'manual' }
                        ))
                .addIntegerOption((option) =>
                    option
                        .setName('minutes')
                        .setDescription('Auto-sync frequency in minutes')
                        .setMinValue(1)
                        .setMaxValue(1440))
                .addBooleanOption((option) =>
                    option
                        .setName('startup_sync')
                        .setDescription('Sync once when the bot starts'))
                .addBooleanOption((option) =>
                    option
                        .setName('shutdown_sync')
                        .setDescription('Sync once when the bot shuts down'))),

    async execute(interaction) {
        const ownerId = process.env.BOT_OWNER_ID;

        if (!ownerId) {
            return interaction.reply({
                content: '❌ BOT_OWNER_ID is not configured.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.user.id !== ownerId) {
            return interaction.reply({
                content: '❌ This command is only available to the bot owner.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'status') {
            return interaction.editReply({ embeds: [buildStatusEmbed(databaseManager.getSyncStatus())] });
        }

        if (subcommand === 'schedule') {
            const mode = interaction.options.getString('mode');
            const minutes = interaction.options.getInteger('minutes');
            const startupSync = interaction.options.getBoolean('startup_sync');
            const shutdownSync = interaction.options.getBoolean('shutdown_sync');

            if (mode === null && minutes === null && startupSync === null && shutdownSync === null) {
                return interaction.editReply({
                    content: '❌ Choose at least one setting to update.'
                });
            }

            const updated = await databaseManager.updateSyncSettings({
                mode: mode ?? undefined,
                intervalMs: typeof minutes === 'number' ? minutes * 60_000 : undefined,
                startupSync: startupSync ?? undefined,
                shutdownSync: shutdownSync ?? undefined
            });

            const embed = buildStatusEmbed(updated)
                .setColor(0x5865F2)
                .setTitle('✅ MongoDB Sync Schedule Updated');

            return interaction.editReply({ embeds: [embed] });
        }

        if (databaseManager.useDB !== 'mongodb' || !databaseManager.db) {
            return interaction.editReply({
                content: '❌ MongoDB is not active. Fix `MONGODB_URI` or auth first, then restart the bot.'
            });
        }

        try {
            const startedAt = Date.now();
            const result = await databaseManager.syncAllJsonToMongo({ force: true, reason: 'manual' });
            const durationMs = Date.now() - startedAt;

            const embed = new EmbedBuilder()
                .setColor(result.failedCount > 0 ? 0xFEE75C : 0x57F287)
                .setTitle('✅ MongoDB Sync Complete')
                .addFields(
                    { name: '📁 Files scanned', value: `${result.totalFiles}`, inline: true },
                    { name: '🔄 Synced', value: `${result.syncedCount}`, inline: true },
                    { name: '⏭️ Skipped', value: `${result.skippedCount}`, inline: true },
                    { name: '❌ Failed', value: `${result.failedCount}`, inline: true },
                    { name: '⏱️ Duration', value: `${durationMs} ms`, inline: true },
                    { name: '🕓 Trigger', value: 'Manual run', inline: true }
                )
                .setTimestamp();

            if (result.failures?.length) {
                const details = result.failures
                    .slice(0, 8)
                    .map((f) => `• ${f.file}: ${f.reason}`)
                    .join('\n');

                embed.addFields({
                    name: '⚠️ Failure details',
                    value: details.length > 1024 ? `${details.slice(0, 1000)}...` : details,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                content: `❌ Sync failed: ${error.message}`
            });
        }
    }
};
