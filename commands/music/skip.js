const queues = require('../utils/queues');
const { requireDJ } = require('../utils/permissions');

async function skipCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    if (!queue || !queue.isPlaying) {
        return message.reply('❌ There is no music playing!');
    }

    queue.skip();
    await message.reply('⏭️ Skipped to next song!');
}

module.exports = {
    name: 'skip',
    description: 'Skip the current song (requires DJ role)',
    execute: requireDJ(skipCommand)
};
