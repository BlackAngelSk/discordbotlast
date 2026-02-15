/**
 * Slash Command: Analytics
 * View server analytics and statistics
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('View server analytics and statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('View overall server analytics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('View command usage statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('View a user\'s activity')
                .addUserOption(option =>
                    option
                        .setName('member')
                        .setDescription('The member to check')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const analyticsManager = require('../../utils/analyticsManager');
        const subcommand = interaction.options.getSubcommand();

        if (!interaction.member.permissions.has('ManageGuild')) {
            return interaction.reply('❌ You need `Manage Guild` permission to use this command.');
        }

        try {
            if (subcommand === 'server') {
                const dashboardData = await analyticsManager.getDashboardData(interaction.guildId);

                const embed = {
                    color: 0x5865F2,
                    title: '📊 Server Analytics',
                    fields: [
                        { name: 'Total Messages', value: dashboardData.overview.messages.toString(), inline: true },
                        { name: 'Commands Used', value: dashboardData.overview.commands.toString(), inline: true },
                        { name: 'Members', value: dashboardData.overview.members.toString(), inline: true },
                        { name: 'Engagement Score', value: `${Math.round(dashboardData.engagement.score)}%`, inline: true },
                        { name: 'Trend', value: dashboardData.engagement.trend, inline: true },
                        {
                            name: 'Top Commands',
                            value: dashboardData.topCommands
                                .slice(0, 5)
                                .map((cmd, i) => `${i+1}. **${cmd.command}** - ${cmd.count} uses`)
                                .join('\n') || 'No command data',
                            inline: false
                        }
                    ],
                    timestamp: new Date()
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'commands') {
                const dashboardData = await analyticsManager.getDashboardData(interaction.guildId);
                
                const topCommands = dashboardData.topCommands
                    .slice(0, 10)
                    .map((cmd, i) => {
                        const successRate = cmd.count > 0 ? Math.round((cmd.success / cmd.count) * 100) : 0;
                        return `${i+1}. **${cmd.command}** - ${cmd.count} uses (${successRate}% success)`;
                    })
                    .join('\n');

                const embed = {
                    color: 0x5865F2,
                    title: '🎯 Command Usage Statistics',
                    description: topCommands || 'No command data available',
                    timestamp: new Date()
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'user') {
                const member = interaction.options.getMember('member');
                const userStats = await analyticsManager.getUserStats(member.id);

                const embed = {
                    color: 0x5865F2,
                    title: `📈 ${member.displayName}'s Activity`,
                    fields: [
                        { name: 'Commands Used', value: userStats.stats.commands.toString(), inline: true },
                        { name: 'Last Active', value: userStats.stats.lastActive ? new Date(userStats.stats.lastActive).toLocaleString() : 'Never', inline: true },
                        {
                            name: 'Recent Activity',
                            value: userStats.activity.length > 0 
                                ? userStats.activity.map(e => `• ${e.type.replace(/_/g, ' ')}`).join('\n')
                                : 'No recent activity',
                            inline: false
                        }
                    ],
                    timestamp: new Date()
                };

                return interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Analytics command error:', error);
            return interaction.reply('❌ An error occurred while retrieving analytics.');
        }
    }
};
