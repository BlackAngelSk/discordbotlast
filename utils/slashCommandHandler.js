const { REST, Routes, Collection, MessageFlags } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

class SlashCommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
    }

    async loadSlashCommands() {
        const slashCommandsPath = path.join(__dirname, '..', 'slashCommands');
        
        try {
            // Recursively load slash commands from all subdirectories
            const loadCommandsRecursive = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Recursively load from subdirectories
                        await loadCommandsRecursive(fullPath);
                    } else if (entry.name.endsWith('.js')) {
                        const command = require(fullPath);
                        
                        if ('data' in command && 'execute' in command) {
                            this.commands.set(command.data.name, command);
                            console.log(`✅ Loaded slash command: ${command.data.name}`);
                        } else {
                            console.log(`⚠️ [WARNING] The slash command at ${entry.name} is missing required "data" or "execute" property.`);
                        }
                    }
                }
            };
            
            await loadCommandsRecursive(slashCommandsPath);
            console.log(`✅ Loaded ${this.commands.size} slash commands!`);
        } catch (error) {
            console.error('Error loading slash commands:', error);
        }
    }

    async registerCommands() {
        const commands = [];
        this.commands.forEach(command => {
            commands.push(command.data.toJSON());
        });

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

            // Register commands globally
            const data = await rest.put(
                Routes.applicationCommands(this.client.user.id),
                { body: commands }
            );

            console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally.`);

            // Also register to test guild if TEST_GUILD_ID is set (for instant updates)
            if (process.env.TEST_GUILD_ID) {
                const guildData = await rest.put(
                    Routes.applicationGuildCommands(this.client.user.id, process.env.TEST_GUILD_ID),
                    { body: commands }
                );
                console.log(`✅ Successfully reloaded ${guildData.length} commands to test guild instantly.`);
            }
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }
    }

    async handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                }
            } catch (e) {
                console.error('Failed to send error response:', e.message);
            }
        }
    }
}

module.exports = SlashCommandHandler;
