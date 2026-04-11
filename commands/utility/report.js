const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'report',
    description: 'Report a user to the server moderators',
    usage: '!report <@user> <reason>',
    aliases: [],
    category: 'utility',
    async execute(message, args, client) {
        if (!message.guild) return;

        const settings = settingsManager.get(message.guild.id);
        const reportChannelId = settings?.reportChannel;

        if (!reportChannelId) {
            return message.reply('❌ This server doesn\'t have a report channel set up. Ask an admin to run `!setreportchannel #channel`.');
        }

        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Please mention a user to report.');
        if (target.id === message.author.id) return message.reply('❌ You cannot report yourself.');
        if (target.bot) return message.reply('❌ You cannot report bots.');

        const reason = args.slice(1).join(' ');
        if (!reason) return message.reply('❌ Please provide a reason for the report.');
        if (reason.length > 500) return message.reply('❌ Reason must be under 500 characters.');

        const channel = await client.channels.fetch(reportChannelId).catch(() => null);
        if (!channel) return message.reply('❌ Report channel not found. Please contact an admin.');

        const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('🚨 User Report')
            .addFields(
                { name: '📌 Reported User', value: `${target.tag} (${target.id})`, inline: true },
                { name: '👤 Reported By', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: '📝 Reason', value: reason },
                { name: '📍 Channel', value: `${message.channel} (${message.channelId})`, inline: true },
                { name: '🔗 Jump to Message', value: `[Click here](${message.url})`, inline: true },
            )
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`report_resolve_${message.author.id}_${target.id}`)
                .setLabel('✅ Resolve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`report_dismiss_${message.author.id}_${target.id}`)
                .setLabel('🚫 Dismiss')
                .setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await message.reply('✅ Your report has been submitted to the moderation team. Thank you!');
    }
};
