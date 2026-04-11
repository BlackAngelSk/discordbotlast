const { PermissionFlagsBits } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'setreportchannel',
    description: 'Set or clear the channel where user reports are sent',
    usage: '!setreportchannel [#channel|none]',
    aliases: ['reportchannel'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission to use this command.');
        }

        if (!args[0]) {
            const settings = settingsManager.get(message.guild.id);
            const current = settings?.reportChannel;
            if (current) {
                return message.reply(`📋 Current report channel: <#${current}>`);
            }
            return message.reply('❌ No report channel is set. Use `!setreportchannel #channel` to configure one.');
        }

        if (args[0].toLowerCase() === 'none') {
            await settingsManager.set(message.guild.id, 'reportChannel', null);
            return message.reply('✅ Report channel has been cleared.');
        }

        const channel = message.mentions.channels.first()
            || message.guild.channels.cache.get(args[0]);

        if (!channel) {
            return message.reply('❌ Please mention a valid channel, e.g. `!setreportchannel #reports`');
        }

        if (!channel.isTextBased()) {
            return message.reply('❌ The report channel must be a text channel.');
        }

        const botMember = message.guild.members.me;
        if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
            return message.reply(`❌ I don't have permission to send messages in ${channel}. Please fix my permissions first.`);
        }

        await settingsManager.set(message.guild.id, 'reportChannel', channel.id);
        return message.reply(`✅ Report channel set to ${channel}. Reports will now be sent there.`);
    }
};
