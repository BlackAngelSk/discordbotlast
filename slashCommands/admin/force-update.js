const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function truncateOutput(text, maxLength = 1200) {
    if (!text) return 'No output';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength)}...`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-update')
        .setDescription('Force-run bot auto update now (Bot Owner Only)')
        .addStringOption((option) =>
            option
                .setName('ref')
                .setDescription('Branch or commit to install (default: main)')
                .setRequired(false))
        .addBooleanOption((option) =>
            option
                .setName('restart')
                .setDescription('Restart bot process after successful update')
                .setRequired(false))
        .addBooleanOption((option) =>
            option
                .setName('delete_missing')
                .setDescription('Delete files not present in update snapshot')
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

        const ref = (interaction.options.getString('ref') || 'main').trim();
        const restartAfter = interaction.options.getBoolean('restart') ?? true;
        const deleteMissing = interaction.options.getBoolean('delete_missing') ?? false;

        const rootDir = path.join(__dirname, '..', '..');
        const updaterPath = path.join(rootDir, 'self updater', 'updater.py');

        if (!fs.existsSync(updaterPath)) {
            return interaction.editReply({
                content: '❌ Updater script not found at self updater/updater.py'
            });
        }

        const pythonExe = process.env.PYTHON_EXE || 'python3';
        const updaterArgs = [
            updaterPath,
            'redo',
            '--target', rootDir,
            '--ref', ref,
            '--backup'
        ];

        if (deleteMissing) {
            updaterArgs.push('--delete-missing');
        }

        let stdout = '';
        let stderr = '';

        try {
            const updater = spawn(pythonExe, updaterArgs, {
                cwd: rootDir,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            updater.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            updater.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            const exitCode = await new Promise((resolve, reject) => {
                updater.on('error', reject);
                updater.on('close', resolve);
            });

            if (exitCode !== 0) {
                return interaction.editReply({
                    content: [
                        `❌ Force update failed (exit code ${exitCode}).`,
                        '',
                        `stderr:\n\`\`\`${truncateOutput(stderr)}\`\`\``,
                        `stdout:\n\`\`\`${truncateOutput(stdout)}\`\`\``
                    ].join('\n')
                });
            }

            await interaction.editReply({
                content: [
                    `✅ Force update completed from ref: ${ref}`,
                    `🧹 Delete missing files: ${deleteMissing ? 'enabled' : 'disabled'}`,
                    `🔁 Restart: ${restartAfter ? 'scheduled' : 'not requested'}`,
                    '',
                    `stdout:\n\`\`\`${truncateOutput(stdout)}\`\`\``
                ].join('\n')
            });

            if (restartAfter) {
                setTimeout(() => {
                    process.exit(0);
                }, 1500);
            }
        } catch (error) {
            return interaction.editReply({
                content: `❌ Force update crashed: ${error.message}`
            });
        }
    }
};
