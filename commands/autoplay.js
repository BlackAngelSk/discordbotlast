const queues = require('../utils/queues');

module.exports = {
    name: 'autoplay',
    description: 'Toggle autoplay mode (plays related songs when queue ends)',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        
        if (!queue) {
            return message.reply('❌ There is no active music session!');
        }

        queue.autoplay = !queue.autoplay;
        
        const status = queue.autoplay ? 'enabled ✅' : 'disabled ❌';
        return message.reply(`🔄 Autoplay is now ${status}`);
    }
};
