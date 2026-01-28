const queues = require('../utils/queues');
const { requireDJ } = require('../utils/permissions');

async function resumeCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    if (!queue) {
        return message.reply('❌ There is no music playing!');
    }

    queue.resume();
    await message.reply('▶️ Resumed playback!');
}

module.exports = {
    name: 'resume',
    description: 'Resume playback (requires DJ role)',
    execute: requireDJ(resumeCommand)
};

