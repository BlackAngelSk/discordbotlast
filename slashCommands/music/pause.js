const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the currently playing music'),
    
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

        if (queue.player.state.status === 'paused') {
            return interaction.reply({ content: '❌ The music is already paused!', ephemeral: true });
        }

        queue.player.pause();

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('⏸️ Music Paused')
            .setDescription('Use `/resume` to continue playing');

        await interaction.reply({ embeds: [embed] });
    }
};
