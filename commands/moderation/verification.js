const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const verificationManager = require('../../utils/verificationManager');

module.exports = {
    name: 'verification',
    description: 'Set up a button-click verification gate for new members',
    usage: '!verification setup <#channel> <@role> | !verification remove | !verification status',
    aliases: ['verify', 'verif'],
    category: 'moderation',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'remove') {
            await verificationManager.remove(message.guild.id);
            return message.reply('✅ Verification gate removed.');
        }

        if (sub === 'status') {
            const config = verificationManager.get(message.guild.id);
            if (!config) return message.reply('❌ No verification gate configured.');
            return message.reply(`✅ Verification: channel <#${config.channelId}>, role <@&${config.roleId}>`);
        }

        // setup (default)
        const channel = message.mentions.channels.first();
        const role = message.mentions.roles.first();

        if (!channel || !role) {
            return message.reply('❌ Usage: `!verification setup <#channel> <@role>`');
        }

        const verifyEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Server Verification')
            .setDescription('Click the button below to verify yourself and gain access to the server!')
            .setFooter({ text: message.guild.name });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`verify_${message.guild.id}`)
                .setLabel('✅ Verify Me')
                .setStyle(ButtonStyle.Success)
        );

        const sentMsg = await channel.send({ embeds: [verifyEmbed], components: [row] });

        await verificationManager.set(message.guild.id, {
            channelId: channel.id,
            roleId: role.id,
            messageId: sentMsg.id,
        });

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Verification Gate Set Up')
            .setDescription(`New members must click the verify button in <#${channel.id}> to receive <@&${role.id}>.`)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
