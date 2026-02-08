const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spouse')
        .setDescription('Check who you or another user is married to')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check (leave empty for yourself)')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user') || interaction.user;
            const spouse = await relationshipManager.getSpouse(interaction.guild.id, user.id);

            if (!spouse) {
                return interaction.reply({ content: `${user.id === interaction.user.id ? 'You are' : `${user.username} is`} not married!`, ephemeral: true });
            }

            const spouseUser = await interaction.client.users.fetch(spouse);

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💑 Spouse Information')
                .setDescription(`${user} is married to ${spouseUser}! 💕`)
                .setThumbnail(spouseUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in spouse command:', error);
            await interaction.reply({ content: '❌ An error occurred while checking spouse information!', ephemeral: true });
        }
    }
};
