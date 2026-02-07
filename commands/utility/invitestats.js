const { EmbedBuilder } = require('discord.js');
const inviteManager = require('../../utils/inviteManager');

module.exports = {
    name: 'invitestats',
    description: 'Show top inviters in the server',
    category: 'utility',
    usage: 'invitestats [limit]',
    async execute(message, args) {
        try {
            const limit = args[0] ? parseInt(args[0]) : 10;

            if (isNaN(limit) || limit < 1 || limit > 50) {
                return message.reply('❌ Please provide a valid limit (1-50).');
            }

            const topInviters = inviteManager.getLeaderboard(message.guild.id, limit);

            if (topInviters.length === 0) {
                return message.reply('📊 No invitation data found for this server.');
            }

            // Fetch user objects for better display
            let leaderboardText = '';
            for (let i = 0; i < topInviters.length; i++) {
                try {
                    const user = await message.client.users.fetch(topInviters[i].userId);
                    leaderboardText += `**${i + 1}.** ${user.username} - **${topInviters[i].count}** invite${topInviters[i].count === 1 ? '' : 's'}\n`;
                } catch (error) {
                    leaderboardText += `**${i + 1}.** Unknown User - **${topInviters[i].count}** invite${topInviters[i].count === 1 ? '' : 's'}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`🏆 Top Inviters - ${message.guild.name}`)
                .setDescription(leaderboardText)
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .setFooter({ text: `Top ${topInviters.length} inviters` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in invitestats command:', error);
            await message.reply('❌ Error retrieving invite stats.');
        }
    },
};
