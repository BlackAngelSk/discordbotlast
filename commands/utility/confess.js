const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'confess',
    description: 'Send an anonymous confession to the server\'s confession channel',
    usage: '!confess <message>',
    aliases: ['confession'],
    category: 'utility',
    async execute(message, args, client) {
        if (!message.guild) return;

        const settings = settingsManager.get(message.guild.id);
        const confessChannelId = settings?.confessionChannel;

        if (!confessChannelId) {
            return message.reply('❌ This server doesn\'t have a confession channel set up. Ask an admin to use `!config confession #channel`.');
        }

        const content = args.join(' ');
        if (!content) return message.reply('❌ Please provide a confession message.');
        if (content.length > 1000) return message.reply('❌ Confession must be under 1000 characters.');

        // Delete the user's message to maintain anonymity
        await message.delete().catch(() => {});

        const channel = await client.channels.fetch(confessChannelId).catch(() => null);
        if (!channel) return;

        const confessionNumber = (settings.confessionCount || 0) + 1;
        settings.confessionCount = confessionNumber;
        await settingsManager.save();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confession_delete_${message.author.id}`)
                .setLabel('🗑️ Delete (Admin)')
                .setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`💌 Anonymous Confession #${confessionNumber}`)
            .setDescription(content)
            .setTimestamp();

        await channel.send({ embeds: [embed], components: [row] });
    }
};
