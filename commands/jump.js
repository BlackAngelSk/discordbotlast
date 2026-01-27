const queues = require('../utils/queues');
const { isDJ } = require('../utils/permissions');

module.exports = {
    name: 'jump',
    description: 'Jump to a specific position in the queue',
    usage: '!jump <position>',
    async execute(message, args) {
        const queue = queues.get(message.guildId);

        if (!queue || !queue.isPlaying) {
            return message.reply('❌ Nothing is playing right now!');
        }

        if (!await isDJ(message.member)) {
            return message.reply('❌ You need the DJ role to use this command!');
        }

        const position = parseInt(args[0]);

        if (!position || isNaN(position)) {
            return message.reply('❌ Please provide a valid position number!');
        }

        if (position < 1 || position > queue.songs.length) {
            return message.reply(`❌ Position must be between 1 and ${queue.songs.length}!`);
        }

        const targetSong = queue.songs[position - 1];
        queue.jump(position);

        message.reply(`⏭️ Jumping to position ${position}: **${targetSong.title}**`);
    },
};
