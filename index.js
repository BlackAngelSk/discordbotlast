require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const CommandHandler = require('./utils/commandHandler');
const EventHandler = require('./utils/eventHandler');
const SlashCommandHandler = require('./utils/slashCommandHandler');
const settingsManager = require('./utils/settingsManager');
const languageManager = require('./utils/languageManager');
const economyManager = require('./utils/economyManager');
const moderationManager = require('./utils/moderationManager');
const gameStatsManager = require('./utils/gameStatsManager');
const statsManager = require('./utils/statsManager');
const reactionRoleManager = require('./utils/reactionRoleManager');
const starboardManager = require('./utils/starboardManager');
const customCommandManager = require('./utils/customCommandManager');
const ticketManager = require('./utils/ticketManager');
const relationshipManager = require('./utils/relationshipManager');
const databaseManager = require('./utils/databaseManager');
const analyticsManager = require('./utils/analyticsManager');
const musicPlaylistManager = require('./utils/musicPlaylistManager');
const enhancedAIManager = require('./utils/enhancedAIManager');
const levelRewardsManager = require('./utils/levelRewardsManager');
const suggestionManager = require('./utils/suggestionManager');
const shopManager = require('./utils/shopManager');
const afkManager = require('./utils/afkManager');
const voiceRewardsManager = require('./utils/voiceRewardsManager');
const raidProtectionManager = require('./utils/raidProtectionManager');
const scheduledMessagesManager = require('./utils/scheduledMessagesManager');
const birthdayManager = require('./utils/birthdayManager');
const customRoleShop = require('./utils/customRoleShop');
const activityTracker = require('./utils/activityTracker');
const serverMilestones = require('./utils/serverMilestones');
const Dashboard = require('./dashboard/server');

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
const slashCommandHandler = new SlashCommandHandler(client);

// Load all commands and events
async function loadHandlers() {
    try {
        // Initialize database first
        await databaseManager.init();
        console.log('✅ Database manager initialized!');

        // Initialize managers first
        await settingsManager.init();
        console.log('✅ Settings manager initialized!');
        
        await languageManager.init();
        console.log('✅ Language manager initialized!');
        
        await economyManager.init();
        console.log('✅ Economy manager initialized!');
        
        await moderationManager.init();
        console.log('✅ Moderation manager initialized!');
        
        await gameStatsManager.init();
        console.log('✅ Game stats manager initialized!');

        await statsManager.init();
        console.log('✅ Stats manager initialized!');

         await levelRewardsManager.init();
        console.log('✅ Level rewards manager initialized!');
        
        await suggestionManager.init();
        console.log('✅ Suggestion manager initialized!');
        
        await shopManager.init();
        console.log('✅ Shop manager initialized!');
        
        await afkManager.init();
        console.log('✅ AFK manager initialized!');
        
        await voiceRewardsManager.init();
        console.log('✅ Voice rewards manager initialized!');
        
        await raidProtectionManager.init();
        console.log('✅ Raid protection manager initialized!');
        
        await scheduledMessagesManager.init(client);
        console.log('✅ Scheduled messages manager initialized!');

        await birthdayManager.init();
        console.log('✅ Birthday manager initialized!');

        await customRoleShop.init();
        console.log('✅ Custom role shop initialized!');

        await activityTracker.init();
        console.log('✅ Activity tracker initialized!');

        await serverMilestones.init();
        console.log('✅ Server milestones initialized!');

        await reactionRoleManager.init();
        console.log('✅ Reaction role manager initialized!');

        await starboardManager.init();
        console.log('✅ Starboard manager initialized!');

        await customCommandManager.init();
        console.log('✅ Custom command manager initialized!');

        await ticketManager.init();
        console.log('✅ Ticket manager initialized!');

        await relationshipManager.init();
        console.log('✅ Relationship manager initialized!');

        await analyticsManager.init();
        console.log('✅ Analytics manager initialized!');

        await musicPlaylistManager.init();
        console.log('✅ Music playlist manager initialized!');

        await enhancedAIManager.init();
        console.log('✅ Enhanced AI manager initialized!');
        
        await commandHandler.loadCommands();
        await eventHandler.loadEvents();
        await slashCommandHandler.loadSlashCommands();
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

    // Handle slash commands
    client.on(Events.InteractionCreate, async (interaction) => {
        await slashCommandHandler.handleInteraction(interaction);
    });

    // Login to Discord with your bot token
    client.login(process.env.DISCORD_TOKEN);

    // Start dashboard and register slash commands when bot is ready
    client.once(Events.ClientReady, async () => {
        console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
        
        // Register slash commands
        await slashCommandHandler.registerCommands();
        
        if (process.env.DASHBOARD_ENABLED === 'true') {
            const dashboard = new Dashboard(client);
            dashboard.start();
        }
    });
});