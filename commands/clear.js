const queues = require('../utils/queues');
const { requireDJ } = require('../utils/permissions');

async function clearCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    
    if (!queue) {
        return message.reply('❌ There is no active music session!');
    }

    if (queue.songs.length === 0) {
        return message.reply('❌ The queue is already empty!');
    }

    const count = queue.songs.length;
    queue.songs = [];
    
    return message.reply(`✅ Cleared ${count} song(s) from the queue!`);
}

module.exports = {
    name: 'clear',
    description: 'Clear all songs from the queue (requires DJ role)',
    execute: requireDJ(clearCommand)
};
