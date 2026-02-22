const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits, MessageFlags, AuditLogEvent } = require('discord.js');

const actionMap = {
    ban: AuditLogEvent.MemberBanAdd,
    unban: AuditLogEvent.MemberBanRemove,
    kick: AuditLogEvent.MemberKick,
    prune: AuditLogEvent.MemberPrune,
    timeout: AuditLogEvent.MemberUpdate,
    message_delete: AuditLogEvent.MessageDelete,
    channel_update: AuditLogEvent.ChannelUpdate,
    role_update: AuditLogEvent.RoleUpdate
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auditlog')
        .setDescription('View or export server audit logs')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View recent audit log entries')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of entries (1-20)')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Filter by user')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Filter by action')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Ban', value: 'ban' },
                            { name: 'Unban', value: 'unban' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Prune', value: 'prune' },
                            { name: 'Timeout', value: 'timeout' },
                            { name: 'Message Delete', value: 'message_delete' },
                            { name: 'Channel Update', value: 'channel_update' },
                            { name: 'Role Update', value: 'role_update' }
                        )))
        .addSubcommand(sub =>
            sub.setName('export')
                .setDescription('Export recent audit logs to CSV')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of entries (1-100)')
                        .setMinValue(1)
                        .setMaxValue(100)
                        .setRequired(false))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Filter by user')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Filter by action')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Ban', value: 'ban' },
                            { name: 'Unban', value: 'unban' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Prune', value: 'prune' },
                            { name: 'Timeout', value: 'timeout' },
                            { name: 'Message Delete', value: 'message_delete' },
                            { name: 'Channel Update', value: 'channel_update' },
                            { name: 'Role Update', value: 'role_update' }
                        )))
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ViewAuditLog')) {
            return interaction.reply({ content: '❌ Missing View Audit Log permission.', flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();
        const limit = interaction.options.getInteger('limit') || (sub === 'view' ? 10 : 50);
        const user = interaction.options.getUser('user');
        const actionKey = interaction.options.getString('action');
        const type = actionKey ? actionMap[actionKey] : undefined;

        const logs = await interaction.guild.fetchAuditLogs({ limit, user, type }).catch(() => null);
        if (!logs) {
            return interaction.reply({ content: '❌ Failed to fetch audit logs.', flags: MessageFlags.Ephemeral });
        }

        const entries = Array.from(logs.entries.values());
        if (entries.length === 0) {
            return interaction.reply({ content: '📝 No audit log entries found.', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'view') {
            const lines = entries.map(entry => {
                const target = entry.target?.tag || entry.target?.name || entry.target?.id || 'Unknown';
                const actor = entry.executor?.tag || 'Unknown';
                return `• **${entry.action}** by **${actor}** → **${target}** (${entry.id})`;
            });

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🧾 Audit Log Entries')
                .setDescription(lines.slice(0, 20).join('\n'))
                .setFooter({ text: `Showing ${Math.min(entries.length, 20)} of ${entries.length}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const header = ['id', 'action', 'executor', 'target', 'reason', 'createdAt'];
        const rows = [header.join(',')];
        for (const entry of entries) {
            const executor = entry.executor?.tag || '';
            const target = entry.target?.tag || entry.target?.name || entry.target?.id || '';
            const reason = (entry.reason || '').replace(/"/g, '""');
            rows.push([entry.id, entry.action, executor, target, reason, entry.createdAt.toISOString()].map(v => `"${v}"`).join(','));
        }

        const csv = rows.join('\n');
        const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `auditlog-${interaction.guildId}.csv` });

        return interaction.reply({ content: `📤 Exported ${entries.length} entries.`, files: [file], flags: MessageFlags.Ephemeral });
    }
};
