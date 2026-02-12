const languageManager = require('../../utils/languageManager');

module.exports = {
    name: 'hello',
    description: 'Get a greeting from the bot',
    async execute(message, args, client) {
        const response = languageManager.get(
            message.guild.id, 
            'commands.hello.response', 
            { user: message.author.username }
        );
        await message.reply(response);
    }
};
