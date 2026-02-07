const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const inviteManager = require('../../utils/inviteManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invitestats')
        .setDescription('Show top inviters in the server')
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of top inviters to show (1-50)')
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(false)
        ),
    category: 'utility',
    async execute(interaction) {
        try {
            const limit = interaction.options.getInteger('limit') || 10;

            const topInviters = inviteManager.getLeaderboard(interaction.guildId, limit);

            if (topInviters.length === 0) {
                return interaction.reply('📊 No invitation data found for this server.');
            }

            // Fetch user objects for better display
            let leaderboardText = '';
            for (let i = 0; i < topInviters.length; i++) {
                try {
                    const user = await interaction.client.users.fetch(topInviters[i].userId);
                    leaderboardText += `**${i + 1}.** ${user.username} - **${topInviters[i].count}** invite${topInviters[i].count === 1 ? '' : 's'}\n`;
                } catch (error) {
                    leaderboardText += `**${i + 1}.** Unknown User - **${topInviters[i].count}** invite${topInviters[i].count === 1 ? '' : 's'}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`🏆 Top Inviters - ${interaction.guild.name}`)
                .setDescription(leaderboardText)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ text: `Top ${topInviters.length} inviters` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in invitestats slash command:', error);
            await interaction.reply({ content: '❌ Error retrieving invite stats.', ephemeral: true });
        }
    },
};
