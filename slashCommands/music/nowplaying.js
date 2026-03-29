const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song'),
    
    async execute(interaction) {
        const queue = interaction.client.queues.get(interaction.guild.id);

        if (!queue || !queue.connection || queue.songs.length === 0) {
            return interaction.reply({ content: '❌ There is no music playing!', flags: MessageFlags.Ephemeral });
        }

        const song = queue.songs[0];

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎵 Now Playing')
            .setDescription(`[${song.title}](${song.url})`)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Duration', value: song.duration || 'Unknown', inline: true },
                { name: 'Requested by', value: `${song.requester}`, inline: true }
            )
            .setFooter({ text: `Volume: ${queue.volume}% | Loop: ${queue.loop ? 'On' : 'Off'}` });

        await interaction.reply({ embeds: [embed] });
    }
};
