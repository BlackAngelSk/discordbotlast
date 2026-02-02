const { EmbedBuilder } = require('discord.js');
const statsManager = require('../../utils/statsManager');

module.exports = {
    name: 'stats',
    description: 'View server statistics!',
    usage: '!stats [users/channels/activity]',
    aliases: ['serverstats', 'activity'],
    category: 'utility',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'overview';

            if (type === 'users') {
                const topUsers = statsManager.getTopUsers(message.guild.id, 10);
                
                let description = '';
                topUsers.forEach((user, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    description += `${medal} <@${user.userId}> - ${user.messages} messages\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📊 Most Active Users')
                    .setDescription(description)
                    .setFooter({ text: `${message.guild.name}` })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            if (type === 'channels') {
                const topChannels = statsManager.getTopChannels(message.guild.id, 8);
                
                let description = '';
                topChannels.forEach((channel, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    description += `${medal} <#${channel.channelId}> - ${channel.messages} messages\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('💬 Most Active Channels')
                    .setDescription(description)
                    .setFooter({ text: `${message.guild.name}` })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            if (type === 'activity') {
                const trend = statsManager.getActivityTrend(message.guild.id, 7);
                
                let description = '**7-Day Activity Trend:**\n';
                Object.entries(trend).forEach(([date, messages]) => {
                    const bar = '█'.repeat(Math.ceil(messages / 100)) || '░';
                    description += `${date}: ${bar} ${messages} messages\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📈 Server Activity Trend')
                    .setDescription(description)
                    .setFooter({ text: `${message.guild.name}` })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            // Overview
            const serverStats = statsManager.getServerStats(message.guild.id);
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📊 Server Statistics')
                .addFields(
                    { name: '💬 Total Messages', value: `${serverStats.totalMessages}`, inline: true },
                    { name: '👥 Members', value: `${message.guild.memberCount}`, inline: true },
                    { name: '📍 Channels', value: `${message.guild.channels.cache.size}`, inline: true }
                )
                .addFields(
                    { name: 'Top Channel', value: `Use \`!stats channels\` for details`, inline: true },
                    { name: 'Most Active User', value: `Use \`!stats users\` for details`, inline: true },
                    { name: 'Activity Trend', value: `Use \`!stats activity\` for details`, inline: true }
                )
                .setFooter({ text: `${message.guild.name}` })
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in stats command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
