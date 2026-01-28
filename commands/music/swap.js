const queues = require('../utils/queues');
const { requireDJ } = require('../utils/permissions');

async function swapCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    
    if (!queue) {
        return message.reply('❌ There is no active music session!');
    }

    if (queue.songs.length < 2) {
        return message.reply('❌ Need at least 2 songs in queue to swap!');
    }

    const pos1 = parseInt(args[0]);
    const pos2 = parseInt(args[1]);

    if (!pos1 || !pos2) {
        return message.reply('❌ Please provide valid positions!\nExample: `!swap 1 3`');
    }

    if (pos1 < 1 || pos1 > queue.songs.length || pos2 < 1 || pos2 > queue.songs.length) {
        return message.reply(`❌ Invalid positions! Queue has ${queue.songs.length} song(s).`);
    }

    if (pos1 === pos2) {
        return message.reply('❌ Cannot swap a song with itself!');
    }

    // Swap the two songs
    const temp = queue.songs[pos1 - 1];
    queue.songs[pos1 - 1] = queue.songs[pos2 - 1];
    queue.songs[pos2 - 1] = temp;

    return message.reply(`✅ Swapped positions ${pos1} and ${pos2}!`);
}

module.exports = {
    name: 'swap',
    description: 'Swap two songs in the queue (requires DJ role)',
    execute: requireDJ(swapCommand)
};
