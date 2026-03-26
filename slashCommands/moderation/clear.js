const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear a specific number of messages from the channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ I don\'t have permission to manage messages!', flags: MessageFlags.Ephemeral });
        }

        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🗑️ Messages Cleared')
                .setDescription(`Successfully deleted **${deleted.size}** messages!`)
                .setFooter({ text: `Cleared by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } catch (error) {
            console.error('Error clearing messages:', error);
            await interaction.reply({ content: '❌ Failed to clear messages! Messages older than 14 days cannot be deleted.', flags: MessageFlags.Ephemeral });
        }
    }
};
