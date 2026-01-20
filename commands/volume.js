const queues = require('../utils/queues');

module.exports = {
    name: 'volume',
    aliases: ['vol', 'v'],
    description: 'Set or check the volume (0-200%)',
    async execute(message, args, client) {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ There is no music playing!');
        }

        // If no argument, show current volume
        if (args.length === 0) {
            const currentVolume = Math.round(queue.volume * 100);
            return message.reply(`🔊 Current volume: **${currentVolume}%**`);
        }

        // Parse volume argument
        const volumeInput = parseInt(args[0]);
        
        if (isNaN(volumeInput)) {
            return message.reply('❌ Please provide a valid number (0-200)!\nExample: `!volume 75`');
        }

        if (volumeInput < 0 || volumeInput > 200) {
            return message.reply('❌ Volume must be between 0 and 200!');
        }

        // Set volume (convert percentage to decimal)
        const newVolume = queue.setVolume(volumeInput / 100);
        
        // Choose emoji based on volume level
        let emoji = '🔊';
        if (newVolume === 0) {
            emoji = '🔇';
        } else if (newVolume < 33) {
            emoji = '🔉';
        } else if (newVolume < 66) {
            emoji = '🔉';
        }

        await message.reply(`${emoji} Volume set to **${newVolume}%**`);
    }
};
