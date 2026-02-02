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
                },
                {
                    name: '🎲 Dice',
                    value: totals.dice > 0
                        ? `**Wins:** ${stats.dice.wins}\n**Losses:** ${stats.dice.losses}\n**Total:** ${totals.dice}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'dice')}%`
                        : 'No games played yet',
                    inline: true
                },
                {
                    name: '🪙 Coinflip',
                    value: totals.coinflip > 0
                        ? `**Wins:** ${stats.coinflip.wins}\n**Losses:** ${stats.coinflip.losses}\n**Total:** ${totals.coinflip}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'coinflip')}%`
                        : 'No games played yet',
                    inline: true
                },
                {
                    name: '✋ Rock Paper Scissors',
                    value: totals.rps > 0
                        ? `**Wins:** ${stats.rps.wins}\n**Losses:** ${stats.rps.losses}\n**Ties:** ${stats.rps.ties}\n**Total:** ${totals.rps}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'rps')}%`
                        : 'No games played yet',
                    inline: true
                },
                {
                    name: '⭕ Tic-Tac-Toe',
                    value: totals.ttt > 0
                        ? `**Wins:** ${stats.ttt.wins}\n**Losses:** ${stats.ttt.losses}\n**Ties:** ${stats.ttt.ties}\n**Total:** ${totals.ttt}\n**Win Rate:** ${gameStatsManager.getWinRate(targetUser.id, 'ttt')}%`
                        : 'No games played yet',
                    inline: true
                }
            )
            .setFooter({ text: `Player ID: ${targetUser.id}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
