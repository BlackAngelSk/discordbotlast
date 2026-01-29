const { requireDJ } = require('../../utils/permissions');

async function removeCommand(message, args, client) {
    const queues = require('../../utils/queues');
    const queue = queues.get(message.guild.id);
    
    if (!queue) {
        return message.reply('❌ There is no active music session!');
    }

    if (queue.songs.length === 0) {
        return message.reply('❌ The queue is empty!');
    }

    const position = parseInt(args[0]);

    if (!position || position < 1 || position > queue.songs.length) {
        return message.reply(`❌ Invalid position! Provide a number between 1 and ${queue.songs.length}.\nExample: \`!remove 3\``);
    }

    const removed = queue.songs.splice(position - 1, 1)[0];
    
    return message.reply(`✅ Removed **${removed.title}** from position ${position}!`);
}

module.exports = {
    name: 'remove',
    description: 'Remove a song from the queue by position (requires DJ role)',
    execute: requireDJ(removeCommand)
};
