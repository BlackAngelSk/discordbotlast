const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot\'s latency'),
    
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: 'Roundtrip Latency', value: `${roundtrip}ms`, inline: true },
                { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
            );

        await interaction.editReply({ content: null, embeds: [embed] });
    }
};
