const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roletemplate')
        .setDescription('Manage role templates')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a role from template')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Template to use')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Admin', value: 'admin' },
                            { name: 'Moderator', value: 'moderator' },
                            { name: 'Supporter', value: 'supporter' },
                            { name: 'Verified', value: 'verified' },
                            { name: 'Member', value: 'member' },
                            { name: 'Muted', value: 'muted' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List available templates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get template information')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Template name')
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const roleTemplateManager = interaction.client.roleTemplateManager;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            await interaction.deferReply();

            const templateName = interaction.options.getString('template');

            try {
                const role = await roleTemplateManager.createRoleFromTemplate(
                    interaction.guild,
                    templateName
                );

                const embed = new EmbedBuilder()
                    .setColor(role.hexColor || '#0099ff')
                    .setTitle('✅ Role Created')
                    .addFields(
                        { name: 'Role', value: `<@&${role.id}>`, inline: true },
                        { name: 'Template', value: templateName, inline: true },
                        { name: 'Color', value: role.hexColor, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({ 
                    content: `❌ Error: ${error.message}` 
                });
            }
        } else if (subcommand === 'list') {
            const templates = roleTemplateManager.listTemplates(interaction.guild.id);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📋 Available Templates')
                .setDescription(templates.map(t => `• \`${t}\``).join('\n'))
                .setFooter({ text: `Total: ${templates.length} template(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'info') {
            const templateName = interaction.options.getString('template');
            const template = roleTemplateManager.getTemplate(interaction.guild.id, templateName);

            if (!template) {
                return await interaction.reply({ 
                    content: '❌ Template not found!', 
                    flags: 64 
                });
            }

            const permissions = template.permissions.slice(0, 10).join(', ') || 'None';

            const embed = new EmbedBuilder()
                .setColor(template.color)
                .setTitle(`📝 Template: ${templateName}`)
                .addFields(
                    { name: 'Name', value: template.name, inline: true },
                    { name: 'Color', value: template.color, inline: true },
                    { name: 'Hoist', value: template.hoist ? 'Yes' : 'No', inline: true },
                    { name: 'Permissions', value: permissions || 'None', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }
};
