const queues = require('../utils/queues');

module.exports = {
    name: 'resume',
    description: 'Resume playback',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ There is no music playing!');
        }

        queue.resume();
        await message.reply('▶️ Resumed playback!');
    }
};
