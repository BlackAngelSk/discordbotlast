const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const aiManager = require('../../utils/aiManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI anything! Powered by Google Gemini')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('What do you want to ask?')
                .setRequired(true)
                .setMaxLength(1024)
        )
        .addIntegerOption(option =>
            option
                .setName('tokens')
                .setDescription('Maximum response length (100-2000)')
                .setRequired(false)
                .setMinValue(100)
                .setMaxValue(2000)
        ),

    async execute(interaction) {
        try {
            // Check if API is configured
            if (!aiManager.isConfigured()) {
                return interaction.reply({
                    content: '❌ The AI feature is not configured. Please set the `GEMINI_API_KEY` in the .env file.',
                    ephemeral: true
                });
            }

            // Defer the reply as API calls can take a moment
            await interaction.deferReply();

            const question = interaction.options.getString('question');
            const maxTokens = interaction.options.getInteger('tokens') || 1000;

            // Send a thinking embed
            const thinkingEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🤔 Thinking...')
                .setDescription(`Processing: \`${question}\``)
                .setFooter({ text: 'Please wait while I generate a response' });

            await interaction.editReply({ embeds: [thinkingEmbed] });

            // Get AI response
            const response = await aiManager.generateContent(question, {
                maxTokens: maxTokens,
                temperature: 0.7,
                topP: 0.9,
                topK: 40
            });

            // Discord limits: embed description max is 4096 chars
            // But we need space for fields, so use a smaller limit for the response content
            const maxResponsePerEmbed = 3500; // Leave room for fields
            
            // Create main response embed with details
            const mainEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🤖 AI Response')
                .addFields(
                    { name: 'Question', value: `\`\`\`${question}\`\`\``, inline: false },
                    { name: 'Model', value: 'Google Gemini 2.5 Flash', inline: true },
                    { name: 'Max Tokens', value: maxTokens.toString(), inline: true }
                )
                .setFooter({ text: `Asked by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            // Check if response needs to be split
            if (response.length > maxResponsePerEmbed) {
                // Add first chunk to main embed
                const firstChunk = response.substring(0, maxResponsePerEmbed);
                mainEmbed.setDescription(firstChunk);
                await interaction.editReply({ embeds: [mainEmbed] });

                // Send remaining chunks as separate messages with full space
                let remaining = response.substring(maxResponsePerEmbed);
                let chunkNumber = 2;
                const maxChunkLength = 4096;

                while (remaining.length > 0) {
                    const chunk = remaining.substring(0, maxChunkLength);
                    remaining = remaining.substring(maxChunkLength);

                    const continuationEmbed = new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle(`🤖 Continuation (Part ${chunkNumber})`)
                        .setDescription(chunk)
                        .setFooter({ text: `Asked by ${interaction.user.tag}` });

                    await interaction.followUp({ embeds: [continuationEmbed] });
                    chunkNumber++;
                }
            } else {
                mainEmbed.setDescription(response);
                await interaction.editReply({ embeds: [mainEmbed] });
            }
        } catch (error) {
            console.error('Error in ask command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Error')
                .setDescription(`Failed to get AI response:\n\`\`\`${error.message}\`\`\``)
                .setFooter({ text: 'Contact the bot developer if this persists' });

            if (!interaction.replied) {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    }
};
