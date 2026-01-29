const queues = require('../../utils/queues');

module.exports = {
    name: 'leave',
    description: 'Leave the voice channel',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ I am not in a voice channel!');
        }

        queue.connection.destroy();
        queues.delete(message.guild.id);
        await message.reply('👋 Left the voice channel!');
    }
};
