const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your or another user\'s profile')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to view (leave empty for yourself)')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user') || interaction.user;
            const economyData = economyManager.getUserData(interaction.guild.id, user.id);
            const gameStats = await gameStatsManager.getUserStats(user.id);
            const spouse = await relationshipManager.getSpouse(interaction.guild.id, user.id);

            let spouseText = 'Single';
            if (spouse) {
                try {
                    const spouseUser = await interaction.client.users.fetch(spouse);
                    spouseText = `💕 Married to ${spouseUser.username}`;
                } catch (e) {
                    spouseText = '💕 Married';
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${user.username}'s Profile`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '💰 Balance', value: `${economyData.balance || 0} coins`, inline: true },
                    { name: '💕 Relationship', value: spouseText, inline: true },
                    { name: '🎮 Games Played', value: `${gameStats?.total || 0}`, inline: true },
                    { name: '🏆 Games Won', value: `${gameStats?.wins || 0}`, inline: true },
                    { name: '❌ Games Lost', value: `${gameStats?.losses || 0}`, inline: true },
                    { name: '📊 Win Rate', value: `${gameStats?.total > 0 ? Math.round((gameStats.wins / gameStats.total) * 100) : 0}%`, inline: true }
                )
                .setFooter({ text: `ID: ${user.id}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in profile command:', error);
            await interaction.reply({ content: '❌ An error occurred while fetching the profile!', flags: MessageFlags.Ephemeral });
        }
    }
};
