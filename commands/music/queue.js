const { EmbedBuilder } = require('discord.js');
const queues = require('../utils/queues');
const { formatDuration } = require('../utils/helpers');

module.exports = {
    name: 'queue',
    description: 'Show the music queue',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue || (!queue.isPlaying && queue.songs.length === 0)) {
            return message.reply('❌ The queue is empty!');
        }

        let queueText = '';
        if (queue.currentSong) {
            queueText += `**Now Playing:**\n🎵 [${queue.currentSong.title}](${queue.currentSong.url})\n\n`;
        }

        if (queue.songs.length > 0) {
            queueText += '**Up Next:**\n';
            queue.songs.slice(0, 10).forEach((song, index) => {
                queueText += `${index + 1}. [${song.title}](${song.url}) - ${formatDuration(song.duration)}\n`;
            });

            if (queue.songs.length > 10) {
                queueText += `\n*...and ${queue.songs.length - 10} more*`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📋 Music Queue')
            .setDescription(queueText);

        await message.reply({ embeds: [embed] });
    }
};
