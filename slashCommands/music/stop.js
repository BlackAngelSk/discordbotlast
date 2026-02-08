const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),
    
    async execute(interaction) {
        const queue = interaction.client.queues.get(interaction.guild.id);

        if (!queue || !queue.connection) {
            return interaction.reply({ content: '❌ There is no music playing!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        if (interaction.guild.members.me.voice.channel && interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id) {
            return interaction.reply({ content: '❌ You need to be in the same voice channel!', ephemeral: true });
        }

        queue.songs = [];
        queue.player.stop();

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('⏹️ Music Stopped')
            .setDescription('The queue has been cleared and playback stopped');

        await interaction.reply({ embeds: [embed] });
    }
};
