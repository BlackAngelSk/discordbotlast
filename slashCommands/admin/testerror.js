const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testerror')
        .setDescription('[Owner only] Trigger a test error for DM alert validation')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Which error path to test')
                .setRequired(false)
                .addChoices(
                    { name: 'console', value: 'console' },
                    { name: 'handler', value: 'handler' }
                )
        ),

    async execute(interaction) {
        const ownerId = process.env.BOT_OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return interaction.reply({
                content: '❌ Only the bot owner can use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const type = interaction.options.getString('type') || 'console';
        const message = `[TEST_ERROR] Manual test from ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId || 'DM'}`;

        if (type === 'handler' && interaction.client.errorHandler) {
            interaction.client.errorHandler.logError('TEST_ERROR', new Error(message), {
                source: 'slash:/testerror',
                triggeredBy: interaction.user.id,
                guildId: interaction.guildId || null
            });
        } else {
            console.error(message);
            console.error(new Error('[TEST_ERROR] Console path test error'));
        }

        return interaction.reply({
            content: '✅ Test error emitted. Check your DM for the alert.',
            flags: MessageFlags.Ephemeral
        });
    }
};
