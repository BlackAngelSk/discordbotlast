const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'leaderboard',
    description: 'View the server leaderboard!',
    usage: '!leaderboard [balance/xp/seasonal]',
    aliases: ['lb', 'top'],
    category: 'economy',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'balance';

            if (!['balance', 'xp', 'seasonal'].includes(type)) {
                return message.reply('❌ Invalid type! Use: `balance`, `xp`, or `seasonal`');
            }

            const leaderboard = economyManager.getLeaderboard(message.guild.id, type === 'xp' ? 'xp' : type === 'seasonal' ? 'seasonalCoins' : 'balance', 10);

            if (leaderboard.length === 0) {
                return message.reply('📊 No users on the leaderboard yet!');
            }

            let description = '';
            leaderboard.forEach((user, index) => {
                let value = '';
                if (type === 'balance') {
                    value = `💰 ${user.balance} coins`;
                } else if (type === 'xp') {
                    value = `⭐ Level ${user.level} (${user.xp} XP)`;
                } else if (type === 'seasonal') {
                    value = `🏆 ${user.seasonalCoins || 0} seasonal coins`;
                }
                
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                description += `${medal} <@${user.userId}> - ${value}\n`;
            });

            const typeEmoji = type === 'balance' ? '💰' : type === 'xp' ? '⭐' : '🏆';
            const typeTitle = type === 'balance' ? 'Richest Users' : type === 'xp' ? 'Top Leveled Users' : 'Seasonal Leaderboard';

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${typeEmoji} ${typeTitle}`)
                .setDescription(description)
                .setFooter({ text: `${message.guild.name} Leaderboard` })
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in leaderboard command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
