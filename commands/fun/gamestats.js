const { EmbedBuilder } = require('discord.js');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'gamestats',
    aliases: ['stats', 'gstats'],
    description: 'View your minigame statistics',
    async execute(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        const stats = gameStatsManager.getStats(targetUser.id);
        const totals = gameStatsManager.getTotalGames(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎮 Game Statistics')
            .setThumbnail(targetUser.displayAvatarURL())
            .setDescription(`Statistics for **${targetUser.username}**`)
            .addFields(
                {
                    name: '🃏 Blackjack',
                    value: totals.blackjack > 0 
                        ? `**Wins:** ${stats.blackjack.wins}\n**Losses:** ${stats.blackjack.losses}\n**Ties:** ${stats.blackjack.ties}\n**Total:** ${totals.blackjack}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'blackjack')}%`
                        : 'No games played yet',
                    inline: true
                },
                {
                    name: '🎰 Roulette',
                    value: totals.roulette > 0
                        ? `**Wins:** ${stats.roulette.wins}\n**Losses:** ${stats.roulette.losses}\n**Total:** ${totals.roulette}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'roulette')}%`
                        : 'No games played yet',
                    inline: true
                }
            )
            .setFooter({ text: `Player ID: ${targetUser.id}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
