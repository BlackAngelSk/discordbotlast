const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for a channel')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Slowmode delay in seconds (0 to disable)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to set slowmode (defaults to current channel)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const seconds = interaction.options.getInteger('seconds');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ This command only works in text channels!', flags: MessageFlags.Ephemeral });
        }

        try {
            await channel.setRateLimitPerUser(seconds);

            const embed = new EmbedBuilder()
                .setColor(seconds === 0 ? '#FF0000' : '#00FF00')
                .setTitle(seconds === 0 ? '⏱️ Slowmode Disabled' : '⏱️ Slowmode Enabled')
                .setDescription(seconds === 0 ? 
                    `Slowmode has been disabled in ${channel}` :
                    `Slowmode set to **${seconds}** seconds in ${channel}`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Slowmode error:', error);
            await interaction.reply({ content: '❌ Failed to set slowmode!', flags: MessageFlags.Ephemeral });
        }
    },
};
