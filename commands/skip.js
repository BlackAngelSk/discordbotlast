const queues = require('../utils/queues');

module.exports = {
    name: 'skip',
    description: 'Skip the current song',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.isPlaying) {
            return message.reply('❌ There is no music playing!');
        }

        queue.skip();
        await message.reply('⏭️ Skipped to next song!');
    }
};
