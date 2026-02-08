const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('couples')
        .setDescription('View all married couples in this server'),
    
    async execute(interaction) {
        try {
            const couples = await relationshipManager.getCouples(interaction.guild.id);

            if (couples.length === 0) {
                return interaction.reply({ content: '❌ There are no married couples in this server!', ephemeral: true });
            }

            let description = '';
            for (let i = 0; i < couples.length; i++) {
                try {
                    const user1 = await interaction.client.users.fetch(couples[i].user1);
                    const user2 = await interaction.client.users.fetch(couples[i].user2);
                    description += `${i + 1}. ${user1} 💕 ${user2}\n`;
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
            await interaction.reply({ content: '❌ An error occurred while fetching couples!', ephemeral: true });
        }
    }
};
