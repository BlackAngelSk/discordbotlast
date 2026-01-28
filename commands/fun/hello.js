module.exports = {
    name: 'hello',
    description: 'Get a greeting from the bot',
    async execute(message, args, client) {
        await message.reply(`👋 Hello ${message.author.username}!`);
    }
};
