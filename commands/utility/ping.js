module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    async execute(message, args, client) {
        const sent = await message.reply('🏓 Pinging...');
        const timeDiff = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`🏓 Pong! Latency: ${timeDiff}ms | API Latency: ${Math.round(client.ws.ping)}ms`);
    }
};
