const queues = require('../../utils/queues');
const { requireDJ } = require('../../utils/permissions');

async function stopCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    if (!queue) {
        return message.reply('❌ There is no music playing!');
    }

    queue.stop();
    await message.reply('⏹️ Stopped music and cleared the queue!');
}

module.exports = {
    name: 'stop',
    description: 'Stop playing music and clear the queue (requires DJ role)',
    execute: requireDJ(stopCommand)
};
