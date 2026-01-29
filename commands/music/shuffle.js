const queues = require('../../utils/queues');
const { requireDJ } = require('../../utils/permissions');

async function shuffleCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    
    if (!queue) {
        return message.reply('❌ There is no active music session!');
    }

    if (queue.songs.length < 2) {
        return message.reply('❌ Need at least 2 songs in queue to shuffle!');
    }

    // Fisher-Yates shuffle algorithm
    for (let i = queue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
    }

    return message.reply(`🔀 Shuffled ${queue.songs.length} songs in the queue!`);
}

module.exports = {
    name: 'shuffle',
    description: 'Shuffle the queue randomly (requires DJ role)',
    execute: requireDJ(shuffleCommand)
};
