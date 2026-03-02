const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Poll question')
                .setRequired(true)
                .setMaxLength(256)
        )
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('First option')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Second option')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Third option (optional)')
                .setRequired(false)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Fourth option (optional)')
                .setRequired(false)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Poll duration (e.g., 1h, 30m, 1d)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const InputValidator = interaction.client.InputValidator;
        
        const question = interaction.options.getString('question');
        const options = [
            interaction.options.getString('option1'),
            interaction.options.getString('option2'),
            interaction.options.getString('option3'),
            interaction.options.getString('option4')
        ].filter(Boolean);

        const durationStr = interaction.options.getString('duration') || '1h';

        // Validate inputs
        const questionValidation = InputValidator.validateString(question, { minLength: 5, maxLength: 256 });
        if (!questionValidation.valid) {
            return await interaction.reply({ content: `❌ ${questionValidation.error}`, flags: 64 });
        }

        if (options.length < 2) {
            return await interaction.reply({ 
                content: '❌ You need at least 2 options!', 
                flags: 64 
            });
        }

        if (options.length > 4) {
            return await interaction.reply({ 
                content: '❌ Maximum 4 options allowed!', 
                flags: 64 
            });
        }

        const durationValidation = InputValidator.validateDuration(durationStr);
        if (!durationValidation.valid) {
            return await interaction.reply({ content: `❌ ${durationValidation.error}`, flags: 64 });
        }

        // Create poll embed
        const pollData = {
            createdBy: interaction.user.id,
            createdAt: Date.now(),
            endsAt: Date.now() + durationValidation.value,
            votes: {}
        };

        // Initialize votes for each option
        options.forEach((opt, idx) => {
            pollData.votes[idx] = new Set();
        });

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📊 ' + question)
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`).join('\n'))
            .addFields({ 
                name: 'Votes', 
                value: options.map((opt, idx) => `**${String.fromCharCode(65 + idx)}**: 0 votes`).join('\n'),
                inline: false
            })
            .setFooter({ text: `Poll ends at:` })
            .setTimestamp(new Date(pollData.endsAt));

        // Create vote buttons
        const buttons = new ActionRowBuilder();
        for (let i = 0; i < options.length; i++) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`poll_vote_${i}`)
                    .setLabel(`${String.fromCharCode(65 + i)}`)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        // Send poll
        const message = await interaction.reply({ 
            embeds: [embed], 
            components: [buttons],
            withResponse: true
        });

        // Store poll data
        if (!interaction.client.polls) {
            interaction.client.polls = new Map();
        }
        interaction.client.polls.set(message.id, {
            ...pollData,
            options,
            messageId: message.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId
        });

        // Auto-close poll after duration
        setTimeout(() => {
            if (interaction.client.polls.has(message.id)) {
                // Could send final results here
                interaction.client.polls.delete(message.id);
            }
        }, durationValidation.value);
    }
};
