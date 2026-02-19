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
                // Reset specific user
                const key = `${message.guildId}_${user.id}`;
                economyManager.data.users[key] = {
                    balance: 0,
                    xp: 0,
                    level: 1,
                    lastDaily: null,
                    lastWeekly: null,
                    inventory: [],
                    dailyStreak: 0,
                    streakBonusMultiplier: 1,
                    seasonalCoins: 0
                };
                await economyManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('♻️ Economy Reset')
                    .setDescription(`Economy data for <@${user.id}> has been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } else {
                // Reset all users in guild
                const guildPrefix = `${message.guildId}_`;
                const usersToReset = Object.keys(economyManager.data.users)
                    .filter(key => key.startsWith(guildPrefix));

                for (const key of usersToReset) {
                    economyManager.data.users[key] = {
                        balance: 0,
                        xp: 0,
                        level: 1,
                        lastDaily: null,
                        lastWeekly: null,
                        inventory: [],
                        dailyStreak: 0,
                        streakBonusMultiplier: 1,
                        seasonalCoins: 0
                    };
                }
                await economyManager.save();

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('♻️ Economy Reset')
                    .setDescription(`Economy data for **${usersToReset.length}** users has been reset!`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in reseteconomy command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
