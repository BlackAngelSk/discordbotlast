const { startTetrisSession } = require('../../utils/tetrisSession');

module.exports = {
    name: 'tetris',
    aliases: ['tet'],
    description: 'Play Tetris with button controls right in Discord.',
    category: 'fun',
    cooldown: 5,
    async execute(message) {
        await startTetrisSession({
            sessionKey: `${message.guild.id}_${message.author.id}`,
            userId: message.author.id,
            playerMention: `<@${message.author.id}>`,
            sendInitial: (payload) => message.reply(payload),
            onSessionConflict: () => message.reply('⏳ You already have an active Tetris game in this server.')
        });
    }
};