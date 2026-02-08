const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('accept')
        .setDescription('Accept a marriage proposal'),
    
    async execute(interaction) {
        try {
            const result = await relationshipManager.acceptProposal(interaction.guild.id, interaction.user.id);

            if (!result.success) {
                if (result.reason === 'noProposal') {
                    return interaction.reply({ content: '❌ You don\'t have any pending proposals!', ephemeral: true });
                } else if (result.reason === 'oneAlreadyMarried') {
                    return interaction.reply({ content: '❌ One of you is already married!', ephemeral: true });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('💒 Married!')
                .setDescription(`Congratulations! ${result.user1} and ${result.user2} are now married! 💍💕`)
                .setImage('https://media.giphy.com/media/MOWPkhRAUbR7i/giphy.gif')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in accept command:', error);
            await interaction.reply({ content: '❌ An error occurred while accepting the proposal!', ephemeral: true });
        }
    }
};
