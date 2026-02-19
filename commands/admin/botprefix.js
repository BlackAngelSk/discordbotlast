const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'botprefix',
    description: 'Change the bot prefix for this server (Admin only)',
    usage: '!botprefix <new_prefix>',
    aliases: ['prefix', 'setprefix'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const newPrefix = args[0];

            if (!newPrefix) {
                return message.reply('❌ Please provide a new prefix! Usage: `!botprefix <prefix>`');
            }

            if (newPrefix.length > 3) {
                return message.reply('❌ Prefix must be 3 characters or less!');
            }

            const settings = settingsManager.get(message.guildId) || {};
            const oldPrefix = settings.prefix || '!';
            settings.prefix = newPrefix;
            settingsManager.set(message.guildId, settings);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('⚙️ Prefix Changed')
                .addFields(
                    { name: 'Old Prefix', value: `\`${oldPrefix}\``, inline: true },
                    { name: 'New Prefix', value: `\`${newPrefix}\``, inline: true }
                )
                .setDescription(`You can now use \`${newPrefix}\` to run commands!`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in botprefix command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
