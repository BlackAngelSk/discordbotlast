const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const moderationManager = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modlog')
        .setDescription('Set the moderation log channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for mod logs')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Please select a text channel!', flags: MessageFlags.Ephemeral });
        }

        moderationManager.setModLogChannel(interaction.guildId, channel.id);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Mod Log Channel Set')
            .setDescription(`Moderation actions will now be logged in ${channel}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
