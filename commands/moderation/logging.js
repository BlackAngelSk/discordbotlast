const { EmbedBuilder } = require('discord.js');
const loggingManager = require('../../utils/loggingManager');

module.exports = {
    name: 'logging',
    description: 'Set up logging channel for server events',
    category: 'moderation',
    usage: 'logging <channel>',
    async execute(message, args) {
        try {
            // Check for administrator permission
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need Administrator permission to use this command.');
            }

            // Get channel
            const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);

            if (!channel) {
                return message.reply('❌ Please mention a channel or provide a valid channel ID.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The channel must be a text-based channel.');
            }

            // Set logging channel
            loggingManager.setLoggingChannel(message.guild.id, channel.id);

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Logging Channel Set')
                .setDescription(`Logging channel has been set to ${channel}`)
                .addFields(
                    {
                        name: 'Channel',
                        value: `${channel} (${channel.id})`,
                        inline: true,
                    },
                    {
                        name: 'What will be logged?',
                        value: `
• Message deletes and edits
• Member joins and leaves
• Role changes
• Channel creation/deletion
• And more!
                        `,
                        inline: false,
                    }
                )
                .setFooter({ text: 'All events will now be logged here' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in logging command:', error);
            await message.reply('❌ An error occurred while setting up logging.');
        }
    },
};
