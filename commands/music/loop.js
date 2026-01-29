const queues = require('../../utils/queues');
const { isDJ } = require('../../utils/permissions');

module.exports = {
    name: 'loop',
    description: 'Set loop mode (off, song, queue)',
    usage: '!loop <off|song|queue>',
    async execute(message, args) {
        const queue = queues.get(message.guildId);

        if (!queue || !queue.isPlaying) {
            return message.reply('❌ Nothing is playing right now!');
        }

        if (!await isDJ(message.member)) {
            return message.reply('❌ You need the DJ role to use this command!');
        }

        const mode = args[0]?.toLowerCase();
        const validModes = ['off', 'song', 'queue'];

        if (!mode || !validModes.includes(mode)) {
            return message.reply('❌ Invalid mode! Use: `off`, `song`, or `queue`');
        }

        queue.setLoop(mode);

        const modeEmojis = {
            off: '⏹️',
            song: '🔂',
            queue: '🔁'
        };

        const modeMessages = {
            off: 'Loop disabled',
            song: 'Looping current song',
            queue: 'Looping queue'
        };

        message.reply(`${modeEmojis[mode]} ${modeMessages[mode]}`);
    },
};
