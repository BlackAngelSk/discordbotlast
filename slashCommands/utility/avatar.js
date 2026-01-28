const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s avatar')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to get avatar (defaults to you)')
                .setRequired(false)),
    
    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`${target.username}'s Avatar`)
            .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }))
            .setDescription(`[Download](${target.displayAvatarURL({ size: 1024, dynamic: true })})`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
