const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reject')
        .setDescription('Reject a marriage proposal'),
    
    async execute(interaction) {
        try {
            const result = await relationshipManager.rejectProposal(interaction.guild.id, interaction.user.id);

            if (!result.success) {
                return interaction.reply({ content: '❌ You don\'t have any pending proposals!', flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('💔 Proposal Rejected')
                .setDescription(`${result.user2} has rejected ${result.user1}'s proposal.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in reject command:', error);
            await interaction.reply({ content: '❌ An error occurred while rejecting the proposal!', flags: MessageFlags.Ephemeral });
        }
    }
};
