const { EmbedBuilder } = require('discord.js');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'cleargamedata',
    description: 'Reset game statistics (Admin only)',
    usage: '!cleargamedata [@user]',
    aliases: ['resetgames', 'cleargames'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const user = message.mentions.users.first();
            const guildId = message.guildId;

            if (user) {
                // Clear specific user's game data
                const key = `${guildId}_${user.id}`;
                gameStatsManager.stats.set(key, {
                    blackjack: { wins: 0, losses: 0, ties: 0 },
                    roulette: { wins: 0, losses: 0 },
                    rps: { wins: 0, losses: 0, ties: 0 },
                    slots: { wins: 0, losses: 0 },
                    coinflip: { wins: 0, losses: 0 },
                    dice: { wins: 0, losses: 0 },
                    ttt: { wins: 0, losses: 0, ties: 0 }
                });
                await gameStatsManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🎮 Game Data Cleared')
                    .setDescription(`Game statistics for <@${user.id}> have been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } else {
                // Clear all users' game data in guild
                const guildPrefix = `${guildId}_`;
                let resetCount = 0;
                
                for (const [key, stats] of gameStatsManager.stats.entries()) {
                    if (key.startsWith(guildPrefix)) {
                        gameStatsManager.stats.set(key, {
                            blackjack: { wins: 0, losses: 0, ties: 0 },
                            roulette: { wins: 0, losses: 0 },
                            rps: { wins: 0, losses: 0, ties: 0 },
                            slots: { wins: 0, losses: 0 },
                            coinflip: { wins: 0, losses: 0 },
                            dice: { wins: 0, losses: 0 },
                            ttt: { wins: 0, losses: 0, ties: 0 }
                        });
                        resetCount++;
                    }
                }
                await gameStatsManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🎮 Game Data Cleared')
                    .setDescription(`Game statistics for **${resetCount}** users have been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in cleargamedata command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
