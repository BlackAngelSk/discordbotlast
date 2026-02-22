const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const commandPermissionsManager = require('../../utils/commandPermissionsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('command-permissions')
        .setDescription('Enable/disable commands or restrict by role')
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Disable a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to disable')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('enable')
                .setDescription('Enable a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to enable')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('role')
                .setDescription('Require a role for a command')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Command name to restrict')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role required (omit to clear)')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List disabled commands and role restrictions'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Administrator permission required.', flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === 'disable') {
            const command = interaction.options.getString('command');
            await commandPermissionsManager.disableCommand(guildId, command);
            return interaction.reply({ content: `✅ Disabled command **${command}**.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'enable') {
            const command = interaction.options.getString('command');
            await commandPermissionsManager.enableCommand(guildId, command);
            return interaction.reply({ content: `✅ Enabled command **${command}**.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'role') {
            const command = interaction.options.getString('command');
            const role = interaction.options.getRole('role');
            await commandPermissionsManager.setCommandRole(guildId, command, role?.id || null);
            return interaction.reply({ content: role ? `✅ Restricted **${command}** to ${role}.` : `✅ Cleared role restriction for **${command}**.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'list') {
            const cfg = commandPermissionsManager.getGuildConfig(guildId);
            const disabled = cfg.disabled.length ? cfg.disabled.join(', ') : 'None';
            const roleLines = Object.entries(cfg.rolePermissions)
                .map(([cmd, roleId]) => `• **${cmd}** → <@&${roleId}>`)
                .join('\n') || 'None';

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔐 Command Permissions')
                .addFields(
                    { name: 'Disabled Commands', value: disabled, inline: false },
                    { name: 'Role Restrictions', value: roleLines, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
