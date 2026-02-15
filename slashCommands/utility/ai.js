/**
 * Slash Command: AI Chat
 * Use AI-powered responses in Discord
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Chat with an AI assistant')
        .addSubcommand(subcommand =>
            subcommand
                .setName('ask')
                .setDescription('Ask the AI a question')
                .addStringOption(option =>
                    option
                        .setName('question')
                        .setDescription('Your question')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('context')
                        .setDescription('Additional context')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('analyze')
                .setDescription('Analyze content for safety')
                .addStringOption(option =>
                    option
                        .setName('content')
                        .setDescription('Content to analyze')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('suggest-commands')
                .setDescription('Get AI suggestions for custom commands')
                .addStringOption(option =>
                    option
                        .setName('server-type')
                        .setDescription('Type of server (gaming, education, community, etc)')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const enhancedAIManager = require('../../utils/enhancedAIManager');
        const subcommand = interaction.options.getSubcommand();

        try {
            await interaction.deferReply();

            if (subcommand === 'ask') {
                const question = interaction.options.getString('question');
                const context = interaction.options.getString('context');

                const response = await enhancedAIManager.generateResponse(
                    interaction.user.id,
                    question,
                    context
                );

                // Split long responses
                if (response.length > 2000) {
                    const chunks = response.match(/[\s\S]{1,2000}/g) || [];
                    for (const chunk of chunks) {
                        await interaction.channel.send(chunk);
                    }
                } else {
                    await interaction.editReply({
                        embeds: [{
                            color: 0x5865F2,
                            title: '🤖 AI Response',
                            description: response,
                            footer: { text: `Asked by ${interaction.user.username}` },
                            timestamp: new Date()
                        }]
                    });
                }
            }

            if (subcommand === 'analyze') {
                const content = interaction.options.getString('content');

                const analysis = await enhancedAIManager.analyzeContent(content);

                return interaction.editReply({
                    embeds: [{
                        color: analysis.isSafe ? 0x57F287 : 0xED4245,
                        title: analysis.isSafe ? '✅ Safe Content' : '⚠️ Potentially Unsafe Content',
                        fields: [
                            { name: 'Toxicity Level', value: `${(analysis.toxicity * 100).toFixed(1)}%`, inline: true },
                            { name: 'Categories', value: analysis.categories.join(', ') || 'None', inline: true },
                            { name: 'Analysis', value: analysis.explanation, inline: false }
                        ]
                    }]
                });
            }

            if (subcommand === 'suggest-commands') {
                const serverType = interaction.options.getString('server-type');

                const suggestions = await enhancedAIManager.suggestCustomCommands(serverType);

                const embed = {
                    color: 0x5865F2,
                    title: `💡 Suggested Commands for ${serverType} Server`,
                    fields: []
                };

                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    suggestions.forEach(cmd => {
                        embed.fields.push({
                            name: cmd.name,
                            value: `${cmd.description}\n*Example: ${cmd.example}*`,
                            inline: false
                        });
                    });
                } else {
                    embed.fields.push({
                        name: 'Info',
                        value: 'Unable to generate suggestions. Try again later.'
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('AI command error:', error);
            return interaction.editReply('❌ An error occurred while processing your request.');
        }
    }
};
