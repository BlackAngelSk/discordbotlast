const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const achievementManager = require('../../utils/achievementManager');

module.exports = {
    name: 'daily',
    description: 'Claim your daily coin reward',
    usage: '!daily',
    aliases: ['dailyreward'],
    category: 'economy',
    async execute(message, args, client) {
        try {
            const result = await economyManager.claimDaily(message.guild.id, message.author.id);

            if (!result.success) {
                const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return message.reply(`⏰ You already claimed your daily reward! Come back in **${hours}h ${minutes}m**.`);
            }

            const unlocked = await achievementManager.syncUser(message.guild.id, message.author.id);
            const streakEmoji = result.streak >= 7 ? '🔥' : result.streak >= 3 ? '⚡' : '✨';
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🎁 Daily Reward Claimed!')
                .setDescription(`You received **${result.amount.toLocaleString()} coins**!`)
                .addFields(
                    { name: `${streakEmoji} Streak`, value: `${result.streak} day${result.streak !== 1 ? 's' : ''}`, inline: true },
                    { name: '✖️ Multiplier', value: `${result.multiplier.toFixed(1)}x`, inline: true }
                )
                .setFooter({ text: 'Come back tomorrow to keep your streak!' })
                .setTimestamp();

            if (unlocked.length > 0) {
                embed.addFields({
                    name: '🏅 Achievements Unlocked',
                    value: unlocked.map(a => `${a.emoji} **${a.name}**`).join('\n').substring(0, 1024)
                });
            }

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in daily command:', error);
            message.reply('❌ An error occurred while claiming your daily reward.');
        }
    }
};
