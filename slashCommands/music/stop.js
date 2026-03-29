const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),
    
    async execute(interaction) {
        const queue = interaction.client.queues.get(interaction.guild.id);

        if (!queue || !queue.connection) {
            return interaction.reply({ content: '❌ There is no music playing!', flags: MessageFlags.Ephemeral });
        }

        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', flags: MessageFlags.Ephemeral });
        }

        if (interaction.guild.members.me.voice.channel && interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id) {
            return interaction.reply({ content: '❌ You need to be in the same voice channel!', flags: MessageFlags.Ephemeral });
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
