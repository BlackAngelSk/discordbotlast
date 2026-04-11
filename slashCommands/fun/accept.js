const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');
const achievementManager = require('../../utils/achievementManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('accept')
        .setDescription('Accept a marriage proposal'),
    
    async execute(interaction) {
        try {
            const result = await relationshipManager.acceptProposal(interaction.guild.id, interaction.user.id);

            if (!result.success) {
                if (result.reason === 'noProposal') {
                    return interaction.reply({ content: '❌ You don\'t have any pending proposals!', flags: MessageFlags.Ephemeral });
                } else if (result.reason === 'oneAlreadyMarried') {
                    return interaction.reply({ content: '❌ One of you is already married!', flags: MessageFlags.Ephemeral });
                }
            }

            await achievementManager.syncUser(interaction.guild.id, interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('💒 Married!')
                .setDescription(`Congratulations! ${result.user1} and ${result.user2} are now married! 💍💕`)
                .setImage('https://media.giphy.com/media/MOWPkhRAUbR7i/giphy.gif')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in accept command:', error);
            await interaction.reply({ content: '❌ An error occurred while accepting the proposal!', flags: MessageFlags.Ephemeral });
        }
    }
};
