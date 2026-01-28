const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const queues = require('../utils/queues');
const { isDJ } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Play the previous song'),
    
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);

        if (!queue || !queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', flags: MessageFlags.Ephemeral });
        }

        if (!await isDJ(interaction.member)) {
            return interaction.reply({ content: '❌ You need the DJ role to use this command!', flags: MessageFlags.Ephemeral });
        }

        const success = queue.playPrevious();

        if (!success) {
            return interaction.reply({ content: '❌ No previous song in history!', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('⏮️ Playing Previous Song')
            .setDescription('Going back to the previous song...')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
