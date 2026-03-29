const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused music'),
    
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

        if (queue.player.state.status !== 'paused') {
            return interaction.reply({ content: '❌ The music is not paused!', flags: MessageFlags.Ephemeral });
        }

        queue.player.unpause();

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('▶️ Music Resumed')
            .setDescription('Playback has been resumed');

        await interaction.reply({ embeds: [embed] });
    }
};
