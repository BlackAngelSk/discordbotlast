require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const CommandHandler = require('./utils/commandHandler');
const EventHandler = require('./utils/eventHandler');
const settingsManager = require('./utils/settingsManager');

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

// Initialize handlers
const commandHandler = new CommandHandler(client);
const eventHandler = new EventHandler(client);

// Load all commands and events
async function loadHandlers() {
    try {
        // Initialize settings manager first
        await settingsManager.init();
        console.log('✅ Settings manager initialized!');
        
        await commandHandler.loadCommands();
        await eventHandler.loadEvents();
        console.log('✅ All handlers loaded successfully!');
    } catch (error) {
        console.error('❌ Error loading handlers:', error);
        process.exit(1);
    }
}

// Load handlers before logging in
loadHandlers().then(() => {
    // Handle messages for commands
    client.on(Events.MessageCreate, async (message) => {
        await commandHandler.handleCommand(message);
    });

    // Login to Discord with your bot token
    client.login(process.env.DISCORD_TOKEN);
});