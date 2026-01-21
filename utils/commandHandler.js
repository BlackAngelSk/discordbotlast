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
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
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
                console.warn(`⚠️ Command at ${filePath} is missing required "name" or "execute" property.`);
            }
        }
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
