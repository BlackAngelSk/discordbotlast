const queues = require('../utils/queues');

module.exports = {
    name: 'stop',
    description: 'Stop music and clear the queue',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ There is no music playing!');
        }

        queue.stop();
        await message.reply('⏹️ Stopped music and cleared the queue!');
    }
};
