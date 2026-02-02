const { EmbedBuilder } = require('discord.js');
const customCommandManager = require('../../utils/customCommandManager');

module.exports = {
    name: 'customcmd',
    description: 'Create, remove, or view custom commands!',
    usage: '!customcmd <add/remove/list> [name] [response]',
    aliases: ['cc', 'customcommand'],
    category: 'moderation',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const action = args[0]?.toLowerCase();

            if (!action || !['add', 'remove', 'list'].includes(action)) {
                return message.reply('❌ Usage: `!customcmd add <name> <response>`, `!customcmd remove <name>`, or `!customcmd list`');
            }

            if (action === 'add') {
                const name = args[1];
                const response = args.slice(2).join(' ');

                if (!name || !response) {
                    return message.reply('❌ Usage: `!customcmd add <name> <response>`');
                }

                if (name.length > 20) {
                    return message.reply('❌ Command name must be 20 characters or less!');
                }

                await customCommandManager.addCommand(message.guild.id, name, response);

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Custom Command Added')
                    .addFields(
                        { name: 'Command', value: `!${name}`, inline: true },
                        { name: 'Response', value: response || 'No response', inline: false }
                    );

                return message.reply({ embeds: [embed] });
            }

            if (action === 'remove') {
                const name = args[1];

                if (!name) {
                    return message.reply('❌ Usage: `!customcmd remove <name>`');
                }

                const command = customCommandManager.getCommand(message.guild.id, name);
                if (!command) {
                    return message.reply('❌ Custom command not found!');
                }

                await customCommandManager.removeCommand(message.guild.id, name);

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('✅ Custom Command Removed')
                    .addFields({ name: 'Command', value: `!${name}` });

                return message.reply({ embeds: [embed] });
            }

            if (action === 'list') {
                const commands = customCommandManager.getCommands(message.guild.id);
                const commandList = Object.keys(commands);

                if (commandList.length === 0) {
                    return message.reply('❌ No custom commands found!');
                }

                let description = '';
                commandList.forEach((cmd) => {
                    description += `**!${cmd}** - ${commands[cmd].substring(0, 50)}${commands[cmd].length > 50 ? '...' : ''}\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📝 Custom Commands')
                    .setDescription(description)
                    .setFooter({ text: `Total: ${commandList.length} commands` });

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in customcmd command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
