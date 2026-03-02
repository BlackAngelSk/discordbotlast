const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('propose')
        .setDescription('Propose marriage to someone!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to propose to')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');

            if (user.id === interaction.user.id) {
                return interaction.reply({ content: '❌ You cannot propose to yourself!', ephemeral: true });
            }

            if (user.bot) {
                return interaction.reply({ content: '❌ You cannot propose to a bot!', ephemeral: true });
            }

            const proposal = await relationshipManager.propose(interaction.guild.id, interaction.user.id, user.id);

            if (!proposal.success) {
                if (proposal.reason === 'oneAlreadyMarried') {
                    return interaction.reply({ content: '❌ One of you is already married!', ephemeral: true });
                } else if (proposal.reason === 'proposalExists') {
                    return interaction.reply({ content: '❌ There is already a pending proposal between you two!', ephemeral: true });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💍 Marriage Proposal!')
                .setDescription(`${interaction.user} is asking ${user} to marry them! 💕`)
                .addFields(
                    { name: 'Accept', value: 'React with ✅ or use `/accept`', inline: false },
                    { name: 'Reject', value: 'React with ❌ or use `/reject`', inline: false },
                    { name: 'Expires in', value: '24 hours', inline: false }
                )
                .setImage(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'React quickly to respond to this proposal!' })
                .setTimestamp();

            const sentMessage = await interaction.reply({ embeds: [embed], withResponse: true });
            await sentMessage.react('✅');
            await sentMessage.react('❌');

        } catch (error) {
            console.error('Error in propose command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while processing the proposal!', ephemeral: true });
            }
        }
    }
};
