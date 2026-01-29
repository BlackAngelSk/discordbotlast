const queues = require('../../utils/queues');
const { requireDJ } = require('../../utils/permissions');

async function pauseCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
        return message.reply('❌ There is no music playing!');
    }

    queue.pause();
    await message.reply('⏸️ Paused playback!');
}

module.exports = {
    name: 'pause',
    description: 'Pause the current song (requires DJ role)',
    execute: requireDJ(pauseCommand)
};

