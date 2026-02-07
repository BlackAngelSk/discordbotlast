const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'prefix',
    description: 'Manage server prefixes',
    category: 'utility',
    usage: 'prefix [list|add|remove|reset] [prefix]',
    async execute(message, args) {
        try {
            // Check for administrator permission
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need Administrator permission to use this command.');
            }

            const subcommand = args[0]?.toLowerCase();

            // List prefixes
            if (!subcommand || subcommand === 'list') {
                const prefixes = settingsManager.getPrefixes(message.guild.id);
                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📋 Current Prefixes')
                    .setDescription(prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n'))
                    .addFields({
                        name: 'Commands',
                        value: `
• \`${prefixes[0]}prefix add <prefix>\` - Add a new prefix
• \`${prefixes[0]}prefix remove <prefix>\` - Remove a prefix
• \`${prefixes[0]}prefix reset\` - Reset to default prefixes
                        `,
                        inline: false
                    })
                    .setFooter({ text: 'You can have up to 5 prefixes' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            // Add prefix
            if (subcommand === 'add') {
                const newPrefix = args[1];

                if (!newPrefix) {
                    return message.reply('❌ Please provide a prefix to add. Usage: `!prefix add <prefix>`');
                }

                if (newPrefix.length > 5) {
                    return message.reply('❌ Prefix must be 5 characters or less.');
                }

                try {
                    await settingsManager.addPrefix(message.guild.id, newPrefix);
                    const prefixes = settingsManager.getPrefixes(message.guild.id);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefix Added')
                        .setDescription(`Added prefix \`${newPrefix}\``)
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                } catch (error) {
                    return message.reply(`❌ Error: ${error.message}`);
                }
            }

            // Remove prefix
            if (subcommand === 'remove') {
                const prefixToRemove = args[1];

                if (!prefixToRemove) {
                    return message.reply('❌ Please provide a prefix to remove. Usage: `!prefix remove <prefix>`');
                }

                try {
                    await settingsManager.removePrefix(message.guild.id, prefixToRemove);
                    const prefixes = settingsManager.getPrefixes(message.guild.id);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefix Removed')
                        .setDescription(`Removed prefix \`${prefixToRemove}\``)
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                } catch (error) {
                    return message.reply(`❌ Error: ${error.message}`);
                }
            }

            // Reset to default
            if (subcommand === 'reset') {
                try {
                    await settingsManager.setPrefixes(message.guild.id, ['!', '.']);
                    const prefixes = settingsManager.getPrefixes(message.guild.id);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Prefixes Reset')
                        .setDescription('Prefixes have been reset to defaults')
                        .addFields({
                            name: 'Current Prefixes',
                            value: prefixes.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
                        })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                } catch (error) {
                    return message.reply(`❌ Error: ${error.message}`);
                }
            }

            // Unknown subcommand
            return message.reply(`❌ Unknown subcommand. Use: \`!prefix [list|add|remove|reset]\``);
        } catch (error) {
            console.error('Error in prefix command:', error);
            await message.reply('❌ An error occurred while managing prefixes.');
        }
    },
};
