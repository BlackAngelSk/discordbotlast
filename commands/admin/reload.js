const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'reload',
    description: 'Hot-reload a command without restarting the bot.',
    usage: '!reload <commandName>',
    aliases: ['rehash'],
    category: 'admin',
    async execute(message, args, client) {
        // Owner-only: only allow users whose ID is in BOT_OWNER_ID env or has Administrator
        const isOwner = process.env.BOT_OWNER_ID && message.author.id === process.env.BOT_OWNER_ID;
        if (!isOwner && !message.member.permissions.has('Administrator')) {
            return message.reply('❌ Only the bot owner or administrators can reload commands.');
        }

        const commandName = args[0]?.toLowerCase();
        if (!commandName) return message.reply('❌ Provide a command name to reload.');

        // Access the commandHandler (stored on client if available, otherwise reconstruct path)
        const commandHandler = client.commandHandler;
        if (!commandHandler) {
            return message.reply('❌ Command handler is not accessible. Cannot hot-reload.');
        }

        // Find the file for this command
        const commandsPath = path.join(__dirname, '..', '..', 'commands');
        let filePath = null;

        const findFile = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) findFile(full);
                else if (entry.name.endsWith('.js')) {
                    try {
                        const cmd = require(full);
                        if (cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))) {
                            filePath = full;
                        }
                    } catch { /* ignore */ }
                }
            }
        };

        findFile(commandsPath);

        if (!filePath) {
            return message.reply(`❌ Could not find file for command \`${commandName}\`.`);
        }

        try {
            // Remove from require cache
            delete require.cache[require.resolve(filePath)];

            // Re-require
            const newCommand = require(filePath);

            if (!newCommand.name || !newCommand.execute) {
                return message.reply('❌ Reloaded file is missing required `name` or `execute` properties.');
            }

            // Update in handler map
            const oldCommand = commandHandler.commands.get(newCommand.name);

            // Remove old aliases first
            if (oldCommand?.aliases) {
                for (const alias of oldCommand.aliases) {
                    commandHandler.commands.delete(alias);
                }
            }

            // Set new command
            commandHandler.commands.set(newCommand.name, newCommand);
            if (newCommand.aliases) {
                for (const alias of newCommand.aliases) {
                    commandHandler.commands.set(alias, newCommand);
                }
            }

            return message.reply(`✅ Successfully reloaded command \`${newCommand.name}\`!`);
        } catch (err) {
            console.error(`Reload error for ${commandName}:`, err);
            return message.reply(`❌ Failed to reload \`${commandName}\`:\n\`\`\`${err.message}\`\`\``);
        }
    }
};
