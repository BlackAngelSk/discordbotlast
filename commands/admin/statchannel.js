const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const statChannelsManager = require('../../utils/statChannelsManager');

module.exports = {
    name: 'statchannel',
    description: 'Configure dynamic stat channels that auto-update with server info',
    usage: '!statchannel set <type> [#channel] | !statchannel remove <#channel> | !statchannel list | !statchannel types',
    aliases: ['statsvc', 'statvc'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ You need **Manage Channels** permission.');
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'types') {
            const types = statChannelsManager.getTypes();
            return message.reply(`📊 Available stat types:\n${types.map(t => `• \`${t}\``).join('\n')}`);
        }

        if (sub === 'list') {
            const channels = statChannelsManager.getChannels(message.guild.id);
            if (!channels.length) return message.reply('❌ No stat channels configured.');
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📊 Stat Channels')
                .setDescription(channels.map(c => `<#${c.channelId}> — \`${c.type}\``).join('\n'));
            return message.reply({ embeds: [embed] });
        }

        if (sub === 'remove') {
            const ch = message.mentions.channels.first();
            const typeArg = (args[1] || '').toLowerCase();

            if (ch) {
                // Remove by channel mention
                await statChannelsManager.removeChannel(message.guild.id, ch.id);
                return message.reply(`✅ Removed <#${ch.id}> from stat channels.`);
            }

            if (typeArg) {
                // Remove by type name
                const channels = statChannelsManager.getChannels(message.guild.id);
                const match = channels.find(c => c.type === typeArg);
                if (!match) return message.reply(`❌ No stat channel with type \`${typeArg}\` found. Use \`!statchannel list\` to see current stat channels.`);
                await statChannelsManager.removeChannel(message.guild.id, match.channelId);
                return message.reply(`✅ Removed \`${typeArg}\` stat channel (<#${match.channelId}>).`);
            }

            return message.reply('❌ Provide a channel or type name to remove.\nExamples: `!statchannel remove #members` or `!statchannel remove members`');
        }

        if (sub === 'set') {
            const type = (args[1] || '').toLowerCase();
            const types = statChannelsManager.getTypes();
            if (!types.includes(type)) {
                return message.reply(`❌ Invalid type. Use one of: ${types.map(t => `\`${t}\``).join(', ')}\nRun \`!statchannel types\` for details.`);
            }

            let channel = message.mentions.channels.first();
            if (!channel) {
                // Create a new voice channel for the stat
                channel = await message.guild.channels.create({
                    name: `📊 ${type}`,
                    type: ChannelType.GuildVoice,
                    permissionOverwrites: [{
                        id: message.guild.id,
                        deny: [PermissionFlagsBits.Connect],
                        allow: [PermissionFlagsBits.ViewChannel],
                    }],
                });
            }

            await statChannelsManager.addChannel(message.guild.id, channel.id, type);
            await statChannelsManager.update(client);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('📊 Stat Channel Added')
                .setDescription(`<#${channel.id}> will now show live **${type}** stats.\nUpdates every **10 minutes**.\n\n*Tip: Remove the Connect permission so users can't join it.*`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        return message.reply(`❌ Usage: \`!statchannel set <type>\` | \`!statchannel remove #channel\` | \`!statchannel list\` | \`!statchannel types\``);
    }
};
