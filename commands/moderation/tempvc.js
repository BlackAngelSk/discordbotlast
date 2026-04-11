const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const tempVoiceManager = require('../../utils/tempVoiceManager');

module.exports = {
    name: 'tempvc',
    description: 'Set up or remove the temporary voice channel hub',
    usage: '!tempvc set [#channel] | !tempvc remove | !tempvc status',
    aliases: ['tempvoice', 'autovo'],
    category: 'moderation',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ You need **Manage Channels** permission.');
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'remove') {
            tempVoiceManager.removeHub(message.guild.id);
            return message.reply('✅ Temporary voice hub removed. Auto-creation is now disabled.');
        }

        if (sub === 'status') {
            const hubId = tempVoiceManager.getHub(message.guild.id);
            if (!hubId) return message.reply('❌ No temp voice hub is configured.');
            return message.reply(`✅ Current hub: <#${hubId}>`);
        }

        // Default: set
        let channel = message.mentions.channels.first();
        if (!channel) {
            // Try to find by name or create one
            channel = message.guild.channels.cache.find(c => c.name.toLowerCase().includes('create') && c.type === ChannelType.GuildVoice);
        }
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            // Create a hub channel
            channel = await message.guild.channels.create({
                name: '➕ Create Channel',
                type: ChannelType.GuildVoice,
            });
        }

        await tempVoiceManager.setHub(message.guild.id, channel.id);

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🔊 Temporary Voice Channels Enabled')
            .setDescription(`Users who join **${channel.name}** will get their own private voice channel automatically created.\nThe channel is deleted when everyone leaves.`)
            .addFields({ name: 'Hub Channel', value: `<#${channel.id}>` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
