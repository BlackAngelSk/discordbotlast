module.exports = {
    name: 'help',
    description: 'Show available commands',
    async execute(message, args, client) {
        await message.reply({
            content: '📋 **Available Commands:**\n' +
                     '**General:**\n' +
                     '`!ping` - Check bot latency\n' +
                     '`!hello` - Get a greeting\n' +
                     '`!help` - Show this help message\n' +
                     '`!server` - Get server info\n\n' +
                     '**Music:**\n' +
                     '`!play <url or search>` - Play music from YouTube\n' +
                     '`!stop` - Stop music and clear queue\n' +
                     '`!skip` - Skip current song\n' +
                     '`!pause` - Pause playback\n' +
                     '`!resume` - Resume playback\n' +
                     '`!queue` - Show current queue\n' +
                     '`!nowplaying` - Show current song\n' +
                     '`!leave` - Leave voice channel'
        });
    }
};
