const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const statsManager = require('../../utils/statsManager');

module.exports = {
    name: 'serverstats',
    description: 'View server statistics (Admin only)',
    usage: '!serverstats',
    aliases: ['stats', 'guildstats'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const guildId = message.guildId;

            // Get economy stats
            const guildPrefix = `${guildId}_`;
            const economyUsers = Object.keys(economyManager.data.users)
                .filter(key => key.startsWith(guildPrefix)).length;

            const totalCoins = Object.entries(economyManager.data.users)
                .filter(([key]) => key.startsWith(guildPrefix))
                .reduce((sum, [, data]) => sum + (data.balance || 0), 0);

            const totalXP = Object.entries(economyManager.data.users)
                .filter(([key]) => key.startsWith(guildPrefix))
                .reduce((sum, [, data]) => sum + (data.xp || 0), 0);

            // Get member stats
            const totalMembers = message.guild.memberCount;
            const botMembers = message.guild.members.cache.filter(m => m.user.bot).size;
            const humanMembers = totalMembers - botMembers;

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📊 Server Statistics')
                .addFields(
                    { name: '👥 Members', value: `Total: ${totalMembers}\nHumans: ${humanMembers}\nBots: ${botMembers}`, inline: true },
                    { name: '💰 Economy', value: `Users: ${economyUsers}\nTotal Coins: ${totalCoins.toLocaleString()}\nTotal XP: ${totalXP.toLocaleString()}`, inline: true },
                    { name: '📅 Server Info', value: `Created: <t:${Math.floor(message.guild.createdTimestamp / 1000)}:F>\nServer ID: ${message.guild.id}`, inline: false }
                )
                .setThumbnail(message.guild.iconURL())
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in serverstats command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
