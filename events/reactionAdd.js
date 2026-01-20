const { Events } = require('discord.js');
const queues = require('../utils/queues');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {
        if (user.bot) return;
        
        const message = reaction.message;
        const queue = queues.get(message.guild.id);
        
        if (!queue || !queue.nowPlayingMessage || queue.nowPlayingMessage.id !== message.id) {
            return;
        }

        try {
            switch (reaction.emoji.name) {
                case '⏸️': // Pause
                    queue.pause();
                    await message.channel.send('⏸️ Paused playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                    break;
                case '▶️': // Resume
                    queue.resume();
                    await message.channel.send('▶️ Resumed playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                    break;
                case '⏭️': // Skip
                    queue.skip();
                    await message.channel.send('⏭️ Skipped to next song!').then(msg => setTimeout(() => msg.delete(), 3000));
                    break;
                case '⏹️': // Stop
                    queue.stop();
                    await message.channel.send('⏹️ Stopped music and cleared queue!').then(msg => setTimeout(() => msg.delete(), 3000));
                    break;
            }
            
            // Remove user's reaction
            await reaction.users.remove(user.id);
        } catch (error) {
            console.error('Error handling reaction:', error);
        }
    }
};
