const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const aiManager = require('../../utils/aiManager');

function normalizeAIText(text) {
    if (!text || typeof text !== 'string') return '';

    const normalized = text.replace(/\r\n/g, '\n').trim();

    // If model returns one long line, convert sentence flow to readable paragraphs
    if (!normalized.includes('\n') && normalized.length > 300) {
        return normalized.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n\n');
    }

    return normalized;
}

function splitForDiscord(text, maxLength = 1900) {
    const source = normalizeAIText(text);
    if (!source) return [''];
    if (source.length <= maxLength) return [source];

    const chunks = [];
    let remaining = source;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitIndex = remaining.lastIndexOf('\n\n', maxLength);
        if (splitIndex < Math.floor(maxLength * 0.5)) {
            splitIndex = remaining.lastIndexOf('\n', maxLength);
        }
        if (splitIndex < Math.floor(maxLength * 0.5)) {
            splitIndex = remaining.lastIndexOf('. ', maxLength);
            if (splitIndex !== -1) splitIndex += 1;
        }
        if (splitIndex < Math.floor(maxLength * 0.5)) {
            splitIndex = maxLength;
        }

        const chunk = remaining.slice(0, splitIndex).trim();
        if (chunk) chunks.push(chunk);
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks.length > 0 ? chunks : [source];
}

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
                .setDescription('Maximum response length (100-4000)')
                .setRequired(false)
                .setMinValue(100)
                .setMaxValue(4000)
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
            const prompt = [
                'Answer in clear markdown with headings, bullet points, and short paragraphs.',
                'Do not compress everything into one line.',
                `Target a detailed response length appropriate for up to ${maxTokens} tokens.`,
                '',
                question
            ].join('\n');

            // Send a thinking embed
            const thinkingEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🤔 Thinking...')
                .setDescription(`Processing: \`${question}\``)
                .setFooter({ text: 'Please wait while I generate a response' });

            await interaction.editReply({ embeds: [thinkingEmbed] });

            // Get AI response
            const response = await aiManager.generateContent(prompt, {
                maxTokens: maxTokens,
                temperature: 0.7,
                topP: 0.9,
                topK: 40
            });

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

            const chunks = splitForDiscord(response, 1900);

            // For short responses, send in embed with metadata
            if (chunks.length === 1 && chunks[0].length <= 2000) {
                mainEmbed.setDescription(chunks[0]);
                await interaction.editReply({ embeds: [mainEmbed] });
            } else {
                // For longer responses, send header embed then content as plain text
                const headerEmbed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('🤖 AI Response')
                    .addFields(
                        { name: 'Question', value: question.substring(0, 100) + (question.length > 100 ? '...' : ''), inline: false },
                        { name: 'Parts', value: `${chunks.length} message${chunks.length > 1 ? 's' : ''}`, inline: true }
                    )
                    .setFooter({ text: `Asked by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                await interaction.editReply({ embeds: [headerEmbed] });

                // Send each chunk as a plain message for maximum readability
                for (let i = 0; i < chunks.length; i++) {
                    const partLabel = chunks.length > 1 ? `**[Part ${i + 1}/${chunks.length}]**\n\n` : '';
                    await interaction.followUp({
                        content: `${partLabel}${chunks[i]}`
                    });
                }
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
