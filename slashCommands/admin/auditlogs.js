const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auditlogs')
        .setDescription('View audit logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .addSubcommand(subcommand =>
            subcommand
                .setName('recent')
                .setDescription('View recent audit logs')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('Filter by category')
                        .addChoices(
                            { name: 'Moderation', value: 'moderation' },
                            { name: 'Configuration', value: 'configuration' },
                            { name: 'Permissions', value: 'permissions' },
                            { name: 'Roles', value: 'role_management' },
                            { name: 'Channels', value: 'channel_management' },
                            { name: 'Economy', value: 'economy' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('View actions by a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View audit statistics')
        ),
    async execute(interaction) {
        const auditLog = interaction.client.auditLog;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'recent') {
            const category = interaction.options.getString('category');

            const logs = auditLog.getAuditLogs({
                category: category || undefined,
                guildId: interaction.guild.id,
                limit: 10,
                days: 7
            });

            if (logs.length === 0) {
                return await interaction.reply({ 
                    content: '📭 No audit logs found!', 
                    flags: 64 
                });
            }

            const description = logs
                .map(log => 
                    `**${log.action}** (${log.severity})\n` +
                    `By: ${log.executor?.tag || 'Unknown'}\n` +
                    `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`
                )
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📋 Recent Audit Logs')
                .setDescription(description || 'No logs')
                .setFooter({ text: `Total: ${logs.length} log(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'user') {
            const user = interaction.options.getUser('user');

            const logs = auditLog.getExecutorHistory(user.id, 10);

            if (logs.length === 0) {
                return await interaction.reply({ 
                    content: `📭 No actions found for ${user.tag}!`, 
                    flags: 64 
                });
            }

            const description = logs
                .map(log => 
                    `**${log.action}**\n` +
                    `Target: ${log.target?.tag || 'N/A'}\n` +
                    `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`
                )
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#FF6600')
                .setTitle(`📋 Actions by ${user.tag}`)
                .setDescription(description || 'No actions')
                .setThumbnail(user.displayAvatarURL())
                .setFooter({ text: `Total: ${logs.length} action(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'stats') {
            const stats = auditLog.getStats({ guildId: interaction.guild.id });

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Audit Log Statistics')
                .addFields(
                    { name: 'Total Actions', value: String(stats.total), inline: true },
                    { name: 'By Category', value: Object.entries(stats.byCategory)
                        .map(([cat, count]) => `${cat}: ${count}`)
                        .join('\n') || 'None', inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }
};
