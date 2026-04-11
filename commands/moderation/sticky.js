const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const stickyMessages = require('../../utils/stickyMessages');

module.exports = {
    name: 'sticky',
    description: 'Set or remove a sticky message in a channel',
    usage: '!sticky set [#channel] <message> | !sticky remove [#channel] | !sticky list',
    aliases: ['stickymsg'],
    category: 'moderation',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ You need **Manage Messages** permission.');
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'remove') {
            const channel = message.mentions.channels.first() || message.channel;
            await stickyMessages.remove(channel.id);
            return message.reply(`✅ Sticky message removed from <#${channel.id}>.`);
        }

        if (sub === 'list') {
            const entries = Object.entries(stickyMessages.data)
                .filter(([, v]) => v.guildId === message.guild.id);
            if (!entries.length) return message.reply('❌ No sticky messages set.');
            const desc = entries.map(([cId, v]) => `<#${cId}>: ${v.content.substring(0, 60)}...`).join('\n');
            const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('📌 Sticky Messages').setDescription(desc);
            return message.reply({ embeds: [embed] });
        }

        // set (default)
        const channel = message.mentions.channels.first() || message.channel;
        const contentStart = sub === 'set' ? 1 : 0;
        // strip channel mention from args if present
        const filteredArgs = args.slice(contentStart).filter(a => !a.startsWith('<#'));
        const content = filteredArgs.join(' ');
        if (!content) return message.reply('❌ Please provide a message to stick. Usage: `!sticky set [#channel] <message>`');

        await stickyMessages.set(channel.id, message.guild.id, content);

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('📌 Sticky Message Set')
            .setDescription(`Sticky message set in <#${channel.id}>:\n${content.substring(0, 500)}`);
        await message.reply({ embeds: [embed] });
    }
};
