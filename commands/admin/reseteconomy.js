const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'reseteconomy',
    description: 'Reset economy data (Admin only)',
    usage: '!reseteconomy [@user]',
    aliases: ['reseteco'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const user = message.mentions.users.first();

            if (user) {
                // Reset specific user globally
                const userData = economyManager.getUserData(message.guildId, user.id);
                Object.assign(userData, {
                    balance: 0,
                    xp: 0,
                    level: 1,
                    highestLevelReached: 1,
                    lastDaily: null,
                    lastWeekly: null,
                    inventory: [],
                    dailyStreak: 0,
                    streakBonusMultiplier: 1,
                    seasonalCoins: 0,
                    guilds: Array.isArray(userData.guilds) ? userData.guilds : [message.guildId]
                });
                await economyManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('♻️ Economy Reset')
                    .setDescription(`Global economy data for <@${user.id}> has been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } else {
                // Reset all users seen in this guild
                const usersToReset = economyManager.getLeaderboard(message.guildId, 'balance', Number.MAX_SAFE_INTEGER);

                for (const userEntry of usersToReset) {
                    const userData = economyManager.getUserData(message.guildId, userEntry.userId);
                    Object.assign(userData, {
                        balance: 0,
                        xp: 0,
                        level: 1,
                        highestLevelReached: 1,
                        lastDaily: null,
                        lastWeekly: null,
                        inventory: [],
                        dailyStreak: 0,
                        streakBonusMultiplier: 1,
                        seasonalCoins: 0,
                        guilds: Array.isArray(userData.guilds) ? userData.guilds : [message.guildId]
                    });
                }
                await economyManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('♻️ Economy Reset')
                    .setDescription(`Global economy data for **${usersToReset.length}** users has been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in reseteconomy command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
