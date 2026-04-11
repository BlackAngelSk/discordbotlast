const { EmbedBuilder } = require('discord.js');
const achievementManager = require('../../utils/achievementManager');

module.exports = {
    name: 'achievements',
    description: 'View your achievements and badges',
    usage: '!achievements [@user]',
    aliases: ['badges', 'ach'],
    category: 'utility',
    async execute(message, args, client) {
        try {
            const user = message.mentions.users.first() || message.author;
            await achievementManager.syncUser(message.guild.id, user.id, { firstMessage: user.id === message.author.id });
            const all = achievementManager.getAll();
            const earned = achievementManager.getUserAchievements(message.guild.id, user.id);
            const earnedIds = new Set(earned.map(a => a.id));

            const visibleAll = all.filter(a => !a.secret || earnedIds.has(a.id));

            const earnedStr = earned.length > 0
                ? earned.map(a => `${a.emoji} **${a.name}** — ${a.desc}`).join('\n')
                : '*None yet*';

            const lockedStr = visibleAll
                .filter(a => !earnedIds.has(a.id))
                .slice(0, 10)
                .map(a => `${a.emoji} ~~${a.name}~~ — ${a.desc}`)
                .join('\n') || '*All unlocked!*';

            const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle(`🏅 ${user.username}'s Achievements`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: `✅ Earned (${earned.length}/${visibleAll.length})`, value: earnedStr.substring(0, 1024) },
                    { name: '🔒 Locked', value: lockedStr.substring(0, 1024) }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in achievements command:', error);
            message.reply('❌ An error occurred while fetching achievements.');
        }
    }
};
