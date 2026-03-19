const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const databaseManager = require('../../utils/databaseManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mongodb-sync')
        .setDescription('Force sync JSON data to MongoDB now (Bot Owner Only)'),

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

        if (databaseManager.useDB !== 'mongodb' || !databaseManager.db) {
            return interaction.editReply({
                content: '❌ MongoDB is not active. Fix MONGODB_URI/auth first, then restart the bot.'
            });
        }

        try {
            const startedAt = Date.now();
            const result = await databaseManager.syncAllJsonToMongo({ force: true });
            const durationMs = Date.now() - startedAt;

            const embed = new EmbedBuilder()
                .setColor(result.failedCount > 0 ? 0xFEE75C : 0x57F287)
                .setTitle('✅ MongoDB Force Sync Complete')
                .addFields(
                    { name: '📁 Files scanned', value: `${result.totalFiles}`, inline: true },
                    { name: '🔄 Synced', value: `${result.syncedCount}`, inline: true },
                    { name: '⏭️ Skipped', value: `${result.skippedCount}`, inline: true },
                    { name: '❌ Failed', value: `${result.failedCount}`, inline: true },
                    { name: '⏱️ Duration', value: `${durationMs} ms`, inline: true }
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
                content: `❌ Force sync failed: ${error.message}`
            });
        }
    }
};
