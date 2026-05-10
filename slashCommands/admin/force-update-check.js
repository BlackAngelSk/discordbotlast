const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const autoUpdateManager = require('../../utils/autoUpdateManager');

function boolLabel(value) {
    return value ? 'Yes' : 'No';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-update-check')
        .setDescription('Force check GitHub for bot updates now (Bot Owner Only)')
        .addBooleanOption((option) =>
            option
                .setName('apply_update')
                .setDescription('Apply update if detected (default: true)')
                .setRequired(false)),

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

        const applyUpdate = interaction.options.getBoolean('apply_update') ?? true;
        const result = await autoUpdateManager.checkNow('slash-force-check', {
            force: true,
            applyUpdate
        });

        if (!result) {
            return interaction.editReply({ content: '⚠️ No response from auto updater.' });
        }

        if (result.status === 'in-progress') {
            return interaction.editReply({ content: '⏳ An update check is already running. Try again in a few seconds.' });
        }

        if (result.status === 'up-to-date') {
            return interaction.editReply({
                content: [
                    '✅ No updates found.',
                    `Ref: ${result.ref}`,
                    `Latest: ${result.latestShortSha}`,
                    `Current: ${result.lastAppliedShortSha}`,
                    `Apply update: ${boolLabel(applyUpdate)}`
                ].join('\n')
            });
        }

        if (result.status === 'update-available') {
            return interaction.editReply({
                content: [
                    '🆕 Update is available.',
                    `Ref: ${result.ref}`,
                    `Current: ${result.lastAppliedShortSha}`,
                    `Latest: ${result.latestShortSha}`,
                    'No files changed because apply_update was false.'
                ].join('\n')
            });
        }

        if (result.status === 'updated') {
            return interaction.editReply({
                content: [
                    '✅ Update installed successfully.',
                    `Ref: ${result.ref}`,
                    `From: ${result.previousShortSha}`,
                    `To: ${result.latestShortSha}`,
                    `Restart in: ${result.restartInMs} ms`
                ].join('\n')
            });
        }

        if (result.status === 'update-failed') {
            const stderr = result.stderr ? `\nError: ${result.stderr}` : '';
            return interaction.editReply({
                content: `❌ Update check found a new commit, but update failed (exit code ${result.exitCode ?? 'unknown'}).${stderr}`
            });
        }

        if (result.status === 'error') {
            return interaction.editReply({
                content: `❌ Force check failed: ${result.message || 'Unknown error'}`
            });
        }

        return interaction.editReply({
            content: `ℹ️ Force check completed with status: ${result.status}`
        });
    }
};
