const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('divorce')
        .setDescription('Divorce your spouse'),
    
    async execute(interaction) {
        try {
            const result = await relationshipManager.divorce(interaction.guild.id, interaction.user.id);

            if (!result.success) {
                return interaction.reply({ content: '❌ You are not married!', flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('💔 Divorce')
                .setDescription(`${result.user1} and ${result.user2} are now divorced.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in divorce command:', error);
            await interaction.reply({ content: '❌ An error occurred while processing the divorce!', flags: MessageFlags.Ephemeral });
        }
    }
};
