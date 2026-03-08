const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const customCommandManager = require('../../utils/customCommandManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customcmd')
        .setDescription('Create, remove, or view custom commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a custom command')
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('Command name (without prefix)')
                        .setRequired(true)
                        .setMaxLength(20)
                )
                .addStringOption(opt =>
                    opt.setName('response')
                        .setDescription('Response text')
                        .setRequired(true)
                        .setMaxLength(2000)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a custom command')
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('Command name to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all custom commands')
        ),

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();

            if (sub === 'add') {
                const name = interaction.options.getString('name', true).trim().toLowerCase();
                const response = interaction.options.getString('response', true).trim();

                if (!/^[a-z0-9_-]{1,20}$/.test(name)) {
                    return interaction.reply({
                        content: '❌ Command name can only contain letters, numbers, `_`, `-` (max 20).',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await customCommandManager.addCommand(interaction.guildId, name, response);

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Custom Command Added')
                    .addFields(
                        { name: 'Command', value: `!${name}`, inline: true },
                        { name: 'Response', value: response, inline: false }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (sub === 'remove') {
                const name = interaction.options.getString('name', true).trim().toLowerCase();
                const found = customCommandManager.getCommand(interaction.guildId, name);

                if (!found) {
                    return interaction.reply({ content: '❌ Custom command not found!', flags: MessageFlags.Ephemeral });
                }

                await customCommandManager.removeCommand(interaction.guildId, name);

                return interaction.reply({
                    content: `✅ Removed custom command: !${name}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const commands = customCommandManager.getCommands(interaction.guildId);
            const names = Object.keys(commands);

            if (names.length === 0) {
                return interaction.reply({ content: '❌ No custom commands found!', flags: MessageFlags.Ephemeral });
            }

            const lines = names.slice(0, 30).map(cmd => {
                const value = commands[cmd] || '';
                return `**!${cmd}** - ${value.substring(0, 60)}${value.length > 60 ? '...' : ''}`;
            });

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📝 Custom Commands')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `Total: ${names.length}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Error in /customcmd:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ Failed to process custom command.', flags: MessageFlags.Ephemeral });
            }
            return interaction.editReply({ content: '❌ Failed to process custom command.' });
        }
    }
};
