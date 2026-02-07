const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const loggingManager = require('../../utils/loggingManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Set up logging channel for server events')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to log events to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),
    category: 'moderation',
    async execute(interaction) {
        try {
            // Check for administrator permission
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need Administrator permission to use this command.',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('channel');

            if (!channel.isTextBased()) {
                return interaction.reply({
                    content: '❌ The channel must be a text-based channel.',
                    ephemeral: true
                });
            }

            // Set logging channel
            loggingManager.setLoggingChannel(interaction.guildId, channel.id);

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

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in logging slash command:', error);
            await interaction.reply({
                content: '❌ An error occurred while setting up logging.',
                ephemeral: true
            });
        }
    },
};
