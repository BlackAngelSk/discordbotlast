const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing song'),
    
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

        if (queue.songs.length === 0) {
            return interaction.reply({ content: '❌ There are no more songs in the queue!', ephemeral: true });
        }

        queue.player.stop();

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('⏭️ Song Skipped')
            .setDescription('Playing next song in queue');

        await interaction.reply({ embeds: [embed] });
    }
};
