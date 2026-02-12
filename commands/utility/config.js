const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');
const languageManager = require('../../utils/languageManager');

module.exports = {
    name: 'config',
    description: 'Configure bot settings for this server',
    async execute(message, args, client) {
        // Check if user has admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const errorMsg = languageManager.get(message.guild.id, 'common.adminRequired');
            return message.reply(errorMsg);
        }

        const guildId = message.guild.id;
        const settings = settingsManager.get(guildId);
        const prefix = settingsManager.getPrefix(guildId);

        // If no arguments, show current settings
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(languageManager.get(guildId, 'config.title'))
                .setDescription(languageManager.get(guildId, 'config.description'))
                .addFields(
                    { 
                        name: languageManager.get(guildId, 'config.prefix'), 
                        value: `\`${prefix}\``, 
                        inline: true 
                    },
                    { 
                        name: languageManager.get(guildId, 'config.language'), 
                        value: settings.language?.toUpperCase() || 'EN', 
                        inline: true 
                    },
                    { 
                        name: languageManager.get(guildId, 'config.djRole'), 
                        value: settings.djRole, 
                        inline: true 
                    },
                    { 
                        name: languageManager.get(guildId, 'config.autoRole'), 
                        value: settings.autoRole || languageManager.get(guildId, 'common.none'), 
                        inline: true 
                    },
                    { 
                        name: languageManager.get(guildId, 'config.welcomeMessages'), 
                        value: `${languageManager.get(guildId, 'config.status')}: ${settings.welcomeEnabled ? '✅ ' + languageManager.get(guildId, 'common.enabled') : '❌ ' + languageManager.get(guildId, 'common.disabled')}\n` +
                               `${languageManager.get(guildId, 'config.channel')}: ${settings.welcomeChannel ? `<#${settings.welcomeChannel}>` : languageManager.get(guildId, 'common.notSet')}\n` +
                               `${languageManager.get(guildId, 'config.message')}: ${settings.welcomeMessage}`,
                        inline: false 
                    },
                    { 
                        name: languageManager.get(guildId, 'config.leaveMessages'), 
                        value: `${languageManager.get(guildId, 'config.status')}: ${settings.leaveEnabled ? '✅ ' + languageManager.get(guildId, 'common.enabled') : '❌ ' + languageManager.get(guildId, 'common.disabled')}\n` +
                               `${languageManager.get(guildId, 'config.channel')}: ${settings.leaveChannel ? `<#${settings.leaveChannel}>` : languageManager.get(guildId, 'common.notSet')}\n` +
                               `${languageManager.get(guildId, 'config.message')}: ${settings.leaveMessage}`,
                        inline: false 
                    }
                )
                .setFooter({ text: languageManager.get(guildId, 'config.footer', { prefix }) });

            return message.channel.send({ embeds: [embed] });
        }

        const setting = args[0].toLowerCase();
        const value = args.slice(1).join(' ');

        switch (setting) {
            case 'prefix':
                if (!value || value.length > 5) {
                    return message.reply(languageManager.get(guildId, 'config.prefixInvalid', { prefix }));
                }
                await settingsManager.setPrefix(guildId, value);
                return message.reply(languageManager.get(guildId, 'config.prefixChanged', { value }));

            case 'language':
            case 'lang':
                if (!value) {
                    const availableLangs = languageManager.getAvailableLanguages();
                    return message.reply(languageManager.get(guildId, 'config.languageList', { 
                        languages: availableLangs.map(l => `\`${l}\``).join(', ') 
                    }));
                }
                
                const langCode = value.toLowerCase();
                if (!languageManager.isLanguageAvailable(langCode)) {
                    const availableLangs = languageManager.getAvailableLanguages();
                    return message.reply(languageManager.get(guildId, 'config.languageInvalid', { 
                        languages: availableLangs.map(l => `\`${l}\``).join(', '),
                        prefix
                    }));
                }
                
                await settingsManager.set(guildId, 'language', langCode);
                
                // Get language name from the new language file
                const langName = languageManager.getTranslation(langCode, 'languageName') || langCode;
                return message.reply(languageManager.get(guildId, 'config.languageChanged', { 
                    language: langName,
                    code: langCode 
                }));

            case 'welcomechannel':
                const welcomeChannel = message.mentions.channels.first();
                if (!welcomeChannel) {
                    return message.reply(languageManager.get(guildId, 'config.welcomeChannelInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'welcomeChannel', welcomeChannel.id);
                return message.reply(languageManager.get(guildId, 'config.welcomeChannelSet', { channel: welcomeChannel }));

            case 'welcomemessage':
                if (!value) {
                    return message.reply(languageManager.get(guildId, 'config.welcomeMessageInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'welcomeMessage', value);
                return message.reply(languageManager.get(guildId, 'config.welcomeMessageSet', { message: value }));

            case 'welcomeenable':
            case 'welcomeon':
                await settingsManager.set(guildId, 'welcomeEnabled', true);
                return message.reply(languageManager.get(guildId, 'config.welcomeEnabled'));

            case 'welcomedisable':
            case 'welcomeoff':
                await settingsManager.set(guildId, 'welcomeEnabled', false);
                return message.reply(languageManager.get(guildId, 'config.welcomeDisabled'));

            case 'leavechannel':
                const leaveChannel = message.mentions.channels.first();
                if (!leaveChannel) {
                    return message.reply(languageManager.get(guildId, 'config.leaveChannelInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'leaveChannel', leaveChannel.id);
                return message.reply(languageManager.get(guildId, 'config.leaveChannelSet', { channel: leaveChannel }));

            case 'leavemessage':
                if (!value) {
                    return message.reply(languageManager.get(guildId, 'config.leaveMessageInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'leaveMessage', value);
                return message.reply(languageManager.get(guildId, 'config.leaveMessageSet', { message: value }));

            case 'leaveenable':
            case 'leaveon':
                await settingsManager.set(guildId, 'leaveEnabled', true);
                return message.reply(languageManager.get(guildId, 'config.leaveEnabled'));

            case 'leavedisable':
            case 'leaveoff':
                await settingsManager.set(guildId, 'leaveEnabled', false);
                return message.reply(languageManager.get(guildId, 'config.leaveDisabled'));

            case 'autorole':
                if (!value) {
                    return message.reply(languageManager.get(guildId, 'config.autoRoleInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'autoRole', value);
                return message.reply(languageManager.get(guildId, 'config.autoRoleSet', { role: value }));

            case 'djrole':
                if (!value) {
                    return message.reply(languageManager.get(guildId, 'config.djRoleInvalid', { prefix }));
                }
                await settingsManager.set(guildId, 'djRole', value);
                return message.reply(languageManager.get(guildId, 'config.djRoleSet', { role: value }));

            case 'reset':
                await settingsManager.reset(guildId);
                return message.reply(languageManager.get(guildId, 'config.reset'));

            default:
                return message.reply(languageManager.get(guildId, 'config.unknownSetting'));
        }
    }
};
