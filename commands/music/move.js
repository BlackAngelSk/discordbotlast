const queues = require('../../utils/queues');
const { requireDJ } = require('../../utils/permissions');

async function moveCommand(message, args, client) {
    const queue = queues.get(message.guild.id);
    
    if (!queue) {
        return message.reply('❌ There is no active music session!');
    }

    if (queue.songs.length === 0) {
        return message.reply('❌ The queue is empty!');
    }

    const from = parseInt(args[0]);
    const to = parseInt(args[1]);

    if (!from || !to) {
        return message.reply('❌ Please provide valid positions!\nExample: `!move 3 1`');
    }

    if (from < 1 || from > queue.songs.length || to < 1 || to > queue.songs.length) {
        return message.reply(`❌ Invalid positions! Queue has ${queue.songs.length} song(s).`);
    }

    // Move song from position to another
    const song = queue.songs.splice(from - 1, 1)[0];
    queue.songs.splice(to - 1, 0, song);

    return message.reply(`✅ Moved **${song.title}** from position ${from} to ${to}!`);
}

module.exports = {
    name: 'move',
    description: 'Move a song to a different position in the queue (requires DJ role)',
    execute: requireDJ(moveCommand)
};
