const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botstatus')
        .setDescription('View bot status and statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('health')
                .setDescription('Check bot health status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View bot statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('uptime')
                .setDescription('View bot uptime')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backups')
                .setDescription('View backup information')
        ),
    async execute(interaction) {
        const uptimeMonitor = interaction.client.uptimeMonitor;
        const autoBackup = interaction.client.autoBackup;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'health') {
            const healthCheck = uptimeMonitor.getHealthCheck();

            const embed = new EmbedBuilder()
                .setColor(healthCheck.healthy ? '#00FF00' : '#FF0000')
                .setTitle('🏥 Bot Health Status')
                .addFields(
                    { name: 'Online', value: healthCheck.status.online ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Latency', value: `${healthCheck.status.latency}ms`, inline: true },
                    { name: 'Memory', value: `${healthCheck.status.memory.heapUsed}MB / ${healthCheck.status.memory.heapTotal}MB`, inline: true },
                    { name: 'Overall Status', value: healthCheck.healthy ? '✅ Healthy' : '⚠️ Issues Detected', inline: false }
                );

            if (healthCheck.warnings.length > 0) {
                embed.addFields({ 
                    name: 'Warnings', 
                    value: healthCheck.warnings.join('\n'), 
                    inline: false 
                });
            }

            embed.setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'stats') {
            const status = uptimeMonitor.getStatus();
            const commandStats = uptimeMonitor.getCommandStats();

            const topCommands = commandStats.slice(0, 5)
                .map(c => `\`${c.name}\` - ${c.count} uses (${Math.round(c.avgTime)}ms avg)`)
                .join('\n') || 'No commands executed';

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Bot Statistics')
                .addFields(
                    { name: 'Guilds', value: String(status.guilds), inline: true },
                    { name: 'Users', value: String(status.users), inline: true },
                    { name: 'Channels', value: String(status.channels), inline: true },
                    { name: 'Top Commands', value: topCommands, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'uptime') {
            const uptime = uptimeMonitor.getUptime();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('⏱️ Bot Uptime')
                .setDescription(`\`\`\`\n${uptime.formatted}\n\`\`\``)
                .addFields(
                    { name: 'Total', value: `${uptime.ms}ms`, inline: true },
                    { name: 'Days', value: String(uptime.days), inline: true },
                    { name: 'Hours', value: String(uptime.hours), inline: true },
                    { name: 'Minutes', value: String(uptime.minutes), inline: true },
                    { name: 'Seconds', value: String(uptime.seconds), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'backups') {
            await interaction.deferReply();

            const backups = autoBackup.getBackups();
            const stats = autoBackup.getStats();

            if (backups.length === 0) {
                return await interaction.editReply({ 
                    content: '📭 No backups found!' 
                });
            }

            const backupList = backups.slice(0, 5)
                .map(b => 
                    `**${b.name}**\n` +
                    `Created: <t:${Math.floor(b.modified.getTime() / 1000)}:R>\n` +
                    `Size: ${Math.round(b.size / 1024)}KB`
                )
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('💾 Backup Information')
                .addFields(
                    { name: 'Total Backups', value: String(stats.totalBackups), inline: true },
                    { name: 'Total Size', value: `${stats.totalSizeMB}MB`, inline: true },
                    { name: 'Recent Backups', value: backupList, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }
};
