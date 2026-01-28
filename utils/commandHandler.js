const fs = require('fs');
const path = require('path');
const settingsManager = require('./settingsManager');

class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Map();
    }

    async loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        
        // Recursively load commands from all subdirectories
        const loadCommandsRecursive = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively load from subdirectories
                    loadCommandsRecursive(fullPath);
                } else if (entry.name.endsWith('.js')) {
                    const command = require(fullPath);
                    
                    if ('name' in command && 'execute' in command) {
                        this.commands.set(command.name, command);
                        console.log(`✅ Loaded command: ${command.name}`);
                        
                        // Load aliases if they exist
                        if (command.aliases) {
                            for (const alias of command.aliases) {
                                this.commands.set(alias, command);
                            }
                        }
                    } else {
                        console.warn(`⚠️ Command at ${fullPath} is missing required "name" or "execute" property.`);
                    }
                }
            }
        };
        
        loadCommandsRecursive(commandsPath);
    }

    async handleCommand(message) {
        if (message.author.bot) return;

        // Get custom prefix for this server
        const prefix = settingsManager.getPrefix(message.guild.id);
        
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = this.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args, this.client);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.reply('❌ There was an error executing that command!');
        }
    }
}

module.exports = CommandHandler;
