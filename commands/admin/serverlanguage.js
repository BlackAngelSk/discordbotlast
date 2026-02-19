const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');
const languageManager = require('../../utils/languageManager');

module.exports = {
    name: 'serverlanguage',
    description: 'Set the server language (Admin only)',
    usage: '!serverlanguage <en|sk>',
    aliases: ['language', 'lang'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const language = args[0]?.toLowerCase();

            if (!language || !['en', 'sk'].includes(language)) {
                return message.reply('❌ Invalid language! Supported: `en` (English), `sk` (Slovak)');
            }

            const settings = settingsManager.get(message.guildId) || {};
            const oldLanguage = settings.language || 'en';
            settings.language = language;
            settingsManager.set(message.guildId, settings);

            const languageNames = {
                'en': '🇬🇧 English',
                'sk': '🇸🇰 Slovak'
            };

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🌐 Language Changed')
                .addFields(
                    { name: 'Old Language', value: languageNames[oldLanguage], inline: true },
                    { name: 'New Language', value: languageNames[language], inline: true }
                )
                .setDescription('Server language has been updated!')
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in serverlanguage command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
