const { EmbedBuilder } = require('discord.js');
const queues = require('../../utils/queues');
const { formatDuration } = require('../../utils/helpers');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show the currently playing song',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.currentSong) {
            return message.reply('❌ There is no music playing!');
        }

        const song = queue.currentSong;
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🎵 Now Playing')
            .setDescription(`[${song.title}](${song.url})`)
            .addFields({ name: 'Duration', value: formatDuration(song.duration), inline: true })
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Requested by ${song.requester}` });

        await message.reply({ embeds: [embed] });
    }
};
