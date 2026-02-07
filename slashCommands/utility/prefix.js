const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('Manage server prefixes')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all current prefixes')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new prefix')
                .addStringOption(option =>
                    option.setName('prefix')
                        .setDescription('The prefix to add')
                        .setMaxLength(5)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a prefix')
                .addStringOption(option =>
                    option.setName('prefix')
                        .setDescription('The prefix to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset to default prefixes')
        ),
    category: 'utility',
    async execute(interaction) {
        try {
            // Check for administrator permission
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need Administrator permission to use this command.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            // List prefixes
            if (subcommand === 'list') {
                const prefixes = settingsManager.getPrefixes(interaction.guildId);
                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📋 Current Prefixes')
                    .setDescription(prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n'))
                    .addFields({
                        name: 'Commands',
                        value: `
• \`/${interaction.commandName} add <prefix>\` - Add a new prefix
• \`/${interaction.commandName} remove <prefix>\` - Remove a prefix
• \`/${interaction.commandName} reset\` - Reset to default prefixes
                        `,
                        inline: false
                    })
                    .setFooter({ text: 'You can have up to 5 prefixes' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // Add prefix
            if (subcommand === 'add') {
                const newPrefix = interaction.options.getString('prefix');

                try {
                    await settingsManager.addPrefix(interaction.guildId, newPrefix);
                    const prefixes = settingsManager.getPrefixes(interaction.guildId);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefix Added')
                        .setDescription(`Added prefix \`${newPrefix}\``)
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return interaction.reply({ embeds: [embed] });
                } catch (error) {
                    return interaction.reply({
                        content: `❌ Error: ${error.message}`,
                        ephemeral: true
                    });
                }
            }

            // Remove prefix
            if (subcommand === 'remove') {
                const prefixToRemove = interaction.options.getString('prefix');

                try {
                    await settingsManager.removePrefix(interaction.guildId, prefixToRemove);
                    const prefixes = settingsManager.getPrefixes(interaction.guildId);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefix Removed')
                        .setDescription(`Removed prefix \`${prefixToRemove}\``)
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return interaction.reply({ embeds: [embed] });
                } catch (error) {
                    return interaction.reply({
                        content: `❌ Error: ${error.message}`,
                        ephemeral: true
                    });
                }
            }

            // Reset to default
            if (subcommand === 'reset') {
                try {
                    await settingsManager.setPrefixes(interaction.guildId, ['!', '.']);
                    const prefixes = settingsManager.getPrefixes(interaction.guildId);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefixes Reset')
                        .setDescription('Prefixes have been reset to defaults')
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return interaction.reply({ embeds: [embed] });
                } catch (error) {
                    return interaction.reply({
                        content: `❌ Error: ${error.message}`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in prefix slash command:', error);
            await interaction.reply({
                content: '❌ An error occurred while managing prefixes.',
                ephemeral: true
            });
        }
    },
};
