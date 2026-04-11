const { EmbedBuilder } = require('discord.js');
const queues = require('../../utils/queues');

const FILTERS = {
    bassboost: '🎸 Bass Boost',
    nightcore: '🌙 Nightcore',
    vaporwave: '🌊 Vaporwave',
    '8d': '🎧 8D Audio',
    karaoke: '🎤 Karaoke',
    echo: '🔊 Echo',
    loud: '📢 Loud',
    tremolo: '〰️ Tremolo',
    vibrato: '🎵 Vibrato',
    soft: '🤫 Soft',
    off: '❌ No Filter',
};

module.exports = {
    name: 'filter',
    description: 'Apply or remove an audio filter to the music',
    usage: '!filter <filter name>',
    aliases: ['audiofilter', 'af'],
    category: 'music',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.isPlaying) {
            return message.reply('❌ No music is currently playing!');
        }

        if (!args[0]) {
            const list = Object.entries(FILTERS)
                .map(([key, label]) => `\`${key}\` — ${label}${queue.activeFilter === key ? ' ✅' : ''}`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎛️ Audio Filters')
                .setDescription(list)
                .setFooter({ text: `Current filter: ${FILTERS[queue.activeFilter] || 'None'}` });
            return message.reply({ embeds: [embed] });
        }

        const filterName = args[0].toLowerCase();
        if (filterName !== 'off' && !FILTERS[filterName]) {
            return message.reply(`❌ Unknown filter. Use \`!filter\` to see all available filters.`);
        }

        queue.activeFilter = filterName === 'off' ? null : filterName;

        // Restart current song to apply the filter
        if (queue.currentSong) {
            const current = { ...queue.currentSong };
            queue.songs.unshift(current);
            queue.currentSong = null;
        }
        queue.player.stop(); // triggers playNext → plays with new filter

        const label = FILTERS[filterName] || 'None';
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎛️ Audio Filter Updated')
            .setDescription(filterName === 'off' ? '✅ Audio filter removed.' : `✅ Applied **${label}** filter.\n*The current song has been restarted with the new filter.*`)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
