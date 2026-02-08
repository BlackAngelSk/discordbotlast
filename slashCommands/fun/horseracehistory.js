const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('horseracehistory')
        .setDescription('View your horse racing history and statistics'),
    
    async execute(interaction) {
        try {
            const history = await horseRaceManager.getUserHistory(interaction.guild.id, interaction.user.id);

            if (!history || history.length === 0) {
                return interaction.reply({ content: '❌ You haven\'t participated in any horse races yet!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`🏇 ${interaction.user.username}'s Horse Racing History`)
                .setDescription(`Total Races: ${history.length}`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            let recentRaces = '';
            for (let i = 0; i < Math.min(5, history.length); i++) {
                const race = history[i];
                recentRaces += `**${i + 1}.** ${race.won ? '🏆 Won' : '❌ Lost'} - ${race.horse} (${race.buyin} coins)\n`;
            }

            embed.addFields({ name: 'Recent Races', value: recentRaces || 'None' });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in horseracehistory command:', error);
            await interaction.reply({ content: '❌ An error occurred while fetching your history!', ephemeral: true });
        }
    }
};
