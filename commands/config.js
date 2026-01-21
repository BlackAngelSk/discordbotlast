const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const settingsManager = require('../utils/settingsManager');

module.exports = {
    name: 'config',
    description: 'Configure bot settings for this server',
    async execute(message, args, client) {
        // Check if user has admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command!');
        }

        const guildId = message.guild.id;
        const settings = settingsManager.get(guildId);

        // If no arguments, show current settings
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('⚙️ Server Configuration')
                .setDescription('Current bot settings for this server:')
                .addFields(
                    { name: '🔧 Prefix', value: `\`${settings.prefix}\``, inline: true },
                    { name: '🎵 DJ Role', value: settings.djRole, inline: true },
                    { name: '👥 Auto Role', value: settings.autoRole || 'None', inline: true },
                    { 
                        name: '👋 Welcome Messages', 
                        value: `Status: ${settings.welcomeEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                               `Channel: ${settings.welcomeChannel ? `<#${settings.welcomeChannel}>` : 'Not set'}\n` +
                               `Message: ${settings.welcomeMessage}`,
                        inline: false 
                    },
                    { 
                        name: '👋 Leave Messages', 
                        value: `Status: ${settings.leaveEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                               `Channel: ${settings.leaveChannel ? `<#${settings.leaveChannel}>` : 'Not set'}\n` +
                               `Message: ${settings.leaveMessage}`,
                        inline: false 
                    }
                )
                .setFooter({ text: `Use ${settings.prefix}config <setting> <value> to change settings` });

            return message.channel.send({ embeds: [embed] });
        }

        const setting = args[0].toLowerCase();
        const value = args.slice(1).join(' ');

        switch (setting) {
            case 'prefix':
                if (!value || value.length > 5) {
                    return message.reply('❌ Please provide a valid prefix (1-5 characters)!\nExample: `!config prefix !`');
                }
                await settingsManager.setPrefix(guildId, value);
                return message.reply(`✅ Prefix changed to: \`${value}\``);

            case 'welcomechannel':
                const welcomeChannel = message.mentions.channels.first();
                if (!welcomeChannel) {
                    return message.reply('❌ Please mention a channel!\nExample: `!config welcomechannel #welcome`');
                }
                await settingsManager.set(guildId, 'welcomeChannel', welcomeChannel.id);
                return message.reply(`✅ Welcome channel set to ${welcomeChannel}`);

            case 'welcomemessage':
                if (!value) {
                    return message.reply('❌ Please provide a welcome message!\nUse {user} to mention the user\nExample: `!config welcomemessage Welcome {user}!`');
                }
                await settingsManager.set(guildId, 'welcomeMessage', value);
                return message.reply(`✅ Welcome message set to: ${value}`);

            case 'welcomeenable':
            case 'welcomeon':
                await settingsManager.set(guildId, 'welcomeEnabled', true);
                return message.reply('✅ Welcome messages enabled!');

            case 'welcomedisable':
            case 'welcomeoff':
                await settingsManager.set(guildId, 'welcomeEnabled', false);
                return message.reply('❌ Welcome messages disabled!');

            case 'leavechannel':
                const leaveChannel = message.mentions.channels.first();
                if (!leaveChannel) {
                    return message.reply('❌ Please mention a channel!\nExample: `!config leavechannel #goodbye`');
                }
                await settingsManager.set(guildId, 'leaveChannel', leaveChannel.id);
                return message.reply(`✅ Leave channel set to ${leaveChannel}`);

            case 'leavemessage':
                if (!value) {
                    return message.reply('❌ Please provide a leave message!\nUse {user} for the username\nExample: `!config leavemessage Goodbye {user}!`');
                }
                await settingsManager.set(guildId, 'leaveMessage', value);
                return message.reply(`✅ Leave message set to: ${value}`);

            case 'leaveenable':
            case 'leaveon':
                await settingsManager.set(guildId, 'leaveEnabled', true);
                return message.reply('✅ Leave messages enabled!');

            case 'leavedisable':
            case 'leaveoff':
                await settingsManager.set(guildId, 'leaveEnabled', false);
                return message.reply('❌ Leave messages disabled!');

            case 'autorole':
                if (!value) {
                    return message.reply('❌ Please provide a role name!\nExample: `!config autorole Member`');
                }
                await settingsManager.set(guildId, 'autoRole', value);
                return message.reply(`✅ Auto-role set to: ${value}`);

            case 'djrole':
                if (!value) {
                    return message.reply('❌ Please provide a role name!\nExample: `!config djrole DJ`');
                }
                await settingsManager.set(guildId, 'djRole', value);
                return message.reply(`✅ DJ role set to: ${value}`);

            case 'reset':
                await settingsManager.reset(guildId);
                return message.reply('✅ All settings reset to default!');

            default:
                return message.reply(
                    '❌ Unknown setting! Available settings:\n' +
                    '`prefix`, `welcomechannel`, `welcomemessage`, `welcomeenable/disable`\n' +
                    '`leavechannel`, `leavemessage`, `leaveenable/disable`\n' +
                    '`autorole`, `djrole`, `reset`'
                );
        }
    }
};
