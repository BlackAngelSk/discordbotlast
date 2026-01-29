const queues = require('../../utils/queues');
const { isDJ } = require('../../utils/permissions');

module.exports = {
    name: 'previous',
    description: 'Play the previous song',
    usage: '!previous',
    async execute(message, args) {
        const queue = queues.get(message.guildId);

        if (!queue || !queue.isPlaying) {
            return message.reply('❌ Nothing is playing right now!');
        }

        if (!await isDJ(message.member)) {
            return message.reply('❌ You need the DJ role to use this command!');
        }

        const success = queue.playPrevious();

        if (!success) {
            return message.reply('❌ No previous song in history!');
        }

        message.reply('⏮️ Playing previous song...');
    },
};
