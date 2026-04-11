const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

function createProgressBar(current, max, size = 20) {
    const progress = Math.min(Math.floor((current / max) * size), size);
    const empty = size - progress;
    return '█'.repeat(progress) + '░'.repeat(empty);
}

module.exports = {
    name: 'rank',
    description: 'View your XP rank card',
    usage: '!rank [@user]',
    aliases: ['level', 'lvl', 'xp'],
    category: 'utility',
    async execute(message, args, client) {
        try {
            const user = message.mentions.users.first() || message.author;
            const userData = economyManager.getUserData(message.guild.id, user.id);

            const level = userData.level;
            const xp = userData.xp;
            const xpForCurrentLevel = (level - 1) * (level - 1) * 100;
            const xpForNextLevel = level * level * 100;
            const xpProgress = xp - xpForCurrentLevel;
            const xpNeeded = xpForNextLevel - xpForCurrentLevel;
            const progressPct = Math.min(Math.floor((xpProgress / xpNeeded) * 100), 100);
            const bar = createProgressBar(xpProgress, xpNeeded, 25);

            // Get guild rank
            const leaderboard = economyManager.getLeaderboard(message.guild.id, 'xp', 1000);
            const rank = leaderboard.findIndex(u => u.userId === user.id) + 1;

            const colorMap = {
                1: 0xffd700,   // gold
                10: 0xc0c0c0,  // silver
                25: 0xcd7f32,  // bronze
            };
            let color = 0x5865f2;
            if (rank <= 3) color = colorMap[1];
            else if (rank <= 10) color = colorMap[10];
            else if (rank <= 25) color = colorMap[25];

            // Tier badge
            let tier = '🔵 Beginner';
            if (level >= 100) tier = '🔴 Legend';
            else if (level >= 50) tier = '🟣 Master';
            else if (level >= 25) tier = '🟠 Expert';
            else if (level >= 10) tier = '🟡 Skilled';
            else if (level >= 5) tier = '🟢 Novice';

            const embed = new EmbedBuilder()
                .setColor(color)
                .setAuthor({ name: `${user.username}'s Rank Card`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(user.displayAvatarURL({ size: 256, extension: 'png' }))
                .addFields(
                    { name: '🏅 Server Rank', value: rank > 0 ? `#${rank}` : 'Unranked', inline: true },
                    { name: '⭐ Level', value: `${level.toLocaleString()}`, inline: true },
                    { name: '🎖️ Tier', value: tier, inline: true },
                    { name: `📊 XP — ${progressPct}%`, value: `\`${bar}\`\n${xpProgress.toLocaleString()} / ${xpNeeded.toLocaleString()} XP to level ${level + 1}` },
                    { name: '🔥 Daily Streak', value: `${userData.dailyStreak || 0} days`, inline: true },
                    { name: '💰 Balance', value: `${userData.balance.toLocaleString()} coins`, inline: true },
                )
                .setFooter({ text: `Total XP: ${xp.toLocaleString()}` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in rank command:', error);
            message.reply('❌ An error occurred while fetching your rank.');
        }
    }
};
