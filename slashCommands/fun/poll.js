const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Poll question')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Poll options (separate with |)')
                .setRequired(true)),
    
    async execute(interaction) {
        const question = interaction.options.getString('question');
        const optionsString = interaction.options.getString('options');
        const options = optionsString.split('|').map(o => o.trim()).filter(o => o.length > 0);

        if (options.length < 2) {
            return interaction.reply({ content: '❌ You need at least 2 options! Separate them with |', flags: MessageFlags.Ephemeral });
        }

        if (options.length > 10) {
            return interaction.reply({ content: '❌ Maximum 10 options allowed!', flags: MessageFlags.Ephemeral });
        }

        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const optionsText = options.map((opt, i) => `${emojis[i]} ${opt}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📊 ' + question)
            .setDescription(optionsText)
            .setFooter({ text: `Poll by ${interaction.user.tag}` })
            .setTimestamp();

        const message = await interaction.reply({ embeds: [embed], fetchReply: true });

        for (let i = 0; i < options.length; i++) {
            await message.react(emojis[i]);
        }
    },
};
