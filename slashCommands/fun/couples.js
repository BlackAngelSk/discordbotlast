const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('couples')
        .setDescription('View all married couples in this server'),
    
    async execute(interaction) {
        try {
            const couples = relationshipManager.getMarriageLeaderboard(interaction.guild.id, 50);

            if (couples.length === 0) {
                return interaction.reply({ content: '❌ There are no married couples in this server!' });
            }

            let description = '';
            for (let i = 0; i < couples.length; i++) {
                try {
                    const user1 = await interaction.client.users.fetch(couples[i].partner1);
                    const user2 = await interaction.client.users.fetch(couples[i].partner2);
                    const daysMarried = couples[i].daysMarried;
                    description += `${i + 1}. **${user1.username}** 💕 **${user2.username}** - ${daysMarried} days\n`;
                } catch (error) {
                    console.error('Error fetching users:', error);
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💑 Married Couples')
                .setDescription(description || 'No couples found.')
                .setFooter({ text: `Total couples: ${couples.length}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in couples command:', error);
            await interaction.reply({ content: '❌ An error occurred while fetching couples!' });
        }
    }
};
