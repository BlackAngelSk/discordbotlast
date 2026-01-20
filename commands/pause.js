const queues = require('../utils/queues');

module.exports = {
    name: 'pause',
    description: 'Pause the current song',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.isPlaying) {
            return message.reply('❌ There is no music playing!');
        }

        queue.pause();
        await message.reply('⏸️ Paused playback!');
    }
};
