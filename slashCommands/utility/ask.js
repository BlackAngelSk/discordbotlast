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

            // Truncate response if it's too long for Discord
            let displayResponse = response;
            const maxLength = 4096; // Discord embed description limit

            if (displayResponse.length > maxLength) {
                displayResponse = displayResponse.substring(0, maxLength - 100) + '\n\n*[Response truncated - too long to display]*';
            }

            // Create response embed
            const responseEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🤖 AI Response')
                .setDescription(displayResponse)
                .addFields(
                    { name: 'Question', value: `\`\`\`${question}\`\`\``, inline: false },
                    { name: 'Model', value: 'Google Gemini 2.5 Flash', inline: true },
                    { name: 'Max Tokens', value: maxTokens.toString(), inline: true }
                )
                .setFooter({ text: `Asked by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [responseEmbed] });
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
