const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    name: 'profile',
    description: 'View your or another user\'s profile!',
    usage: '!profile [@user]',
    aliases: ['p', 'stats'],
    category: 'utility',
    async execute(message, args) {
        try {
            const user = message.mentions.users.first() || message.author;
            const userData = economyManager.getUserData(message.guild.id, user.id);
            const marriage = relationshipManager.getMarriage(message.guild.id, user.id);

            const xpForNextLevel = (userData.level * userData.level * 100);
            const xpForCurrentLevel = ((userData.level - 1) * (userData.level - 1) * 100);
            const xpProgress = userData.xp - xpForCurrentLevel;
            const xpNeeded = xpForNextLevel - xpForCurrentLevel;
            const progressBar = createProgressBar(xpProgress, xpNeeded, 20);

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${user.username}'s Profile`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '💰 Balance', value: `${userData.balance} coins`, inline: true },
                    { name: '⭐ Level', value: `${userData.level}`, inline: true },
                    { name: '📊 Experience', value: `${userData.xp} XP`, inline: true },
                    { name: 'Progress to Next Level', value: `\`${progressBar}\` ${xpProgress}/${xpNeeded}`, inline: false },
                    { name: '🔥 Daily Streak', value: `${userData.dailyStreak || 0} days`, inline: true },
                    { name: '✖️ Streak Multiplier', value: `${(userData.streakBonusMultiplier || 1).toFixed(1)}x`, inline: true },
                    { name: '🏆 Seasonal Coins', value: `${userData.seasonalCoins || 0} coins`, inline: true },
                    { name: '🎮 Inventory', value: `${userData.inventory.length} items`, inline: true }
                );

            // Add spouse info if married
            if (marriage) {
                const spouse = await message.client.users.fetch(marriage.spouse);
                const daysMarried = Math.floor((Date.now() - marriage.marriedAt) / (1000 * 60 * 60 * 24));
                embed.addFields(
                    { name: '💍 Spouse', value: `${spouse.username}`, inline: true },
                    { name: '💕 Days Married', value: `${daysMarried} days`, inline: true }
                );
            }

            embed.setFooter({ text: 'Keep grinding to level up!' })
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in profile command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};

function createProgressBar(current, max, size = 20) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.floor(size * percentage);
    const empty = size - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}
