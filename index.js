require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, BaseInteraction, MessageFlags } = require('discord.js');
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
const seasonManager = require('./utils/seasonManager');
const seasonLeaderboardManager = require('./utils/seasonLeaderboardManager');
const commandPermissionsManager = require('./utils/commandPermissionsManager');
const Dashboard = require('./dashboard/server');
const { fetchMemberSafe, withTimeout } = require('./utils/discordFetch');

// New system managers
const ErrorHandler = require('./utils/errorHandler');
const CooldownManager = require('./utils/cooldownManager');
const RateLimiter = require('./utils/rateLimiter');
const ShutdownManager = require('./utils/shutdownManager');
const InputValidator = require('./utils/inputValidator');
const Logger = require('./utils/logger');
const UptimeMonitor = require('./utils/uptimeMonitor');
const AutoBackup = require('./utils/autoBackup');
const AuditLog = require('./utils/auditLog');
const WelcomeMessageManager = require('./utils/welcomeMessageManager');
const ReminderManager = require('./utils/reminderManager');
const RoleTemplateManager = require('./utils/roleTemplateManager');

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

// Normalize deprecated ephemeral option to flags to avoid warnings
const normalizeEphemeralOptions = (options) => {
    if (!options || typeof options !== 'object') return options;
    if (!Object.prototype.hasOwnProperty.call(options, 'ephemeral')) return options;

    const normalized = { ...options };
    if (normalized.ephemeral) {
        const currentFlags = normalized.flags || 0;
        normalized.flags = currentFlags | MessageFlags.Ephemeral;
    }
    delete normalized.ephemeral;
    return normalized;
};

const wrapInteractionMethod = (methodName) => {
    const original = BaseInteraction.prototype[methodName];
    if (!original) return;
    BaseInteraction.prototype[methodName] = function (options, ...rest) {
        return original.call(this, normalizeEphemeralOptions(options), ...rest);
    };
};

wrapInteractionMethod('reply');
wrapInteractionMethod('deferReply');
wrapInteractionMethod('followUp');
wrapInteractionMethod('editReply');

// Initialize handlers
const commandHandler = new CommandHandler(client);
const eventHandler = new EventHandler(client);
const slashCommandHandler = new SlashCommandHandler(client);

// Initialize new systems
const errorHandler = new ErrorHandler(client);
const cooldownManager = new CooldownManager();
const rateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
const shutdownManager = new ShutdownManager(client);
const logger = new Logger(client);
const uptimeMonitor = new UptimeMonitor(client);
const autoBackup = new AutoBackup();
const auditLog = new AuditLog();
const welcomeMessageManager = new WelcomeMessageManager();
const reminderManager = new ReminderManager(client);
const roleTemplateManager = new RoleTemplateManager();

// Attach to client for global access
client.errorHandler = errorHandler;
client.cooldownManager = cooldownManager;
client.rateLimiter = rateLimiter;
client.logger = logger;
client.uptimeMonitor = uptimeMonitor;
client.auditLog = auditLog;
client.welcomeMessageManager = welcomeMessageManager;
client.reminderManager = reminderManager;
client.roleTemplateManager = roleTemplateManager;
client.InputValidator = InputValidator;

// Load all commands and events
async function loadHandlers() {
    try {
        console.time('⏱️ Total startup init');

        const runInitStep = async (label, initFn) => {
            const timerLabel = `⏱️ Init: ${label}`;
            console.time(timerLabel);
            await initFn();
            console.timeEnd(timerLabel);
            console.log(`✅ ${label} initialized!`);
        };

        // Initialize database first
        await runInitStep('Database manager', () => databaseManager.init());

        // Core managers (parallel)
        await Promise.all([
            runInitStep('Settings manager', () => settingsManager.init()),
            runInitStep('Language manager', () => languageManager.init()),
            runInitStep('Economy manager', () => economyManager.init()),
            runInitStep('Moderation manager', () => moderationManager.init()),
            runInitStep('Command permissions manager', () => commandPermissionsManager.init()),
            runInitStep('Game stats manager', () => gameStatsManager.init()),
            runInitStep('Stats manager', () => statsManager.init()),
            runInitStep('Level rewards manager', () => levelRewardsManager.init()),
            runInitStep('Suggestion manager', () => suggestionManager.init()),
            runInitStep('Shop manager', () => shopManager.init()),
            runInitStep('AFK manager', () => afkManager.init()),
            runInitStep('Voice rewards manager', () => voiceRewardsManager.init()),
            runInitStep('Raid protection manager', () => raidProtectionManager.init()),
            runInitStep('Birthday manager', () => birthdayManager.init())
        ]);

        // Feature managers (parallel)
        await Promise.all([
            runInitStep('Scheduled messages manager', () => scheduledMessagesManager.init(client)),
            runInitStep('Custom role shop', () => customRoleShop.init()),
            runInitStep('Activity tracker', () => activityTracker.init()),
            runInitStep('Server milestones', () => serverMilestones.init()),
            runInitStep('Season manager', () => seasonManager.init()),
            runInitStep('Season leaderboard manager', () => seasonLeaderboardManager.init()),
            runInitStep('Reaction role manager', () => reactionRoleManager.init()),
            runInitStep('Starboard manager', () => starboardManager.init()),
            runInitStep('Custom command manager', () => customCommandManager.init()),
            runInitStep('Ticket manager', () => ticketManager.init()),
            runInitStep('Relationship manager', () => relationshipManager.init()),
            runInitStep('Analytics manager', () => analyticsManager.init()),
            runInitStep('Music playlist manager', () => musicPlaylistManager.init()),
            runInitStep('Enhanced AI manager', () => enhancedAIManager.init())
        ]);

        await runInitStep('Command handler', () => commandHandler.loadCommands());
        await runInitStep('Event handler', () => eventHandler.loadEvents());
        await runInitStep('Slash command handler', () => slashCommandHandler.loadSlashCommands());

        // Initialize new systems
        logger.success('All new system managers initialized');
        autoBackup.createBackup('startup');
        logger.info('System startup backup created');

        console.timeEnd('⏱️ Total startup init');
        console.log('✅ All handlers loaded successfully!');
    } catch (error) {
        console.error('❌ Error loading handlers:', error);
        errorHandler.logError('STARTUP_ERROR', error);
        process.exit(1);
    }
}

// Load handlers before logging in
let seasonLeaderboardTaskRunning = false;

// Setup shutdown handlers
shutdownManager.onShutdown(async () => {
    logger.info('Running pre-shutdown cleanup tasks');
    
    // Create final backup
    const backup = autoBackup.createBackup('shutdown');
    if (backup) {
        logger.info('Final shutdown backup created', { backup: backup.name });
    }
});

shutdownManager.setShutdownTimeout(30000); // 30 second timeout

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
    client.startReadyTasks = () => {
        // Move non-critical ready work off the first ready tick
        setTimeout(async () => {
            console.log(`✅ Bot startup coordinator running as ${client.user.tag}`);

            // Migrate usernames in existing seasons
            try {
                const migrated = await seasonManager.migrateUsernames(client);
                if (migrated > 0) {
                    console.log(`✅ Migrated ${migrated} usernames in seasons`);
                }
            } catch (error) {
                console.error('Error migrating season usernames:', error);
            }

            // Register slash commands
            try {
                await slashCommandHandler.registerCommands();
                console.log('✅ Slash commands registered');
            } catch (error) {
                console.error('Error registering slash commands:', error);
            }

            if (process.env.DASHBOARD_ENABLED === 'true') {
                try {
                    const dashboard = new Dashboard(client);
                    dashboard.start();
                } catch (error) {
                    console.error('Error starting dashboard:', error);
                }
            }

            // Start season leaderboard update task (runs every minute, respects per-guild interval)
            setInterval(async () => {
                if (seasonLeaderboardTaskRunning) return;
                seasonLeaderboardTaskRunning = true;
                try {
                    await updateSeasonLeaderboards(client);
                } finally {
                    seasonLeaderboardTaskRunning = false;
                }
            }, 60 * 1000); // 1 minute

            // Initial update
            if (!seasonLeaderboardTaskRunning) {
                seasonLeaderboardTaskRunning = true;
                try {
                    await updateSeasonLeaderboards(client);
                } finally {
                    seasonLeaderboardTaskRunning = false;
                }
            }
        }, 0);
    };

    client.login(process.env.DISCORD_TOKEN);
});

/**
 * Update season leaderboards in all configured channels
 * @param {Client} client - Discord client
 */
async function updateSeasonLeaderboards(client) {
    try {
        const guildConfigs = seasonLeaderboardManager.config;

        for (const guildId in guildConfigs) {
            const config = guildConfigs[guildId];
            if (!config.channelId) continue;

            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(config.channelId);
            if (!channel || !channel.isTextBased()) continue;

            const seasonName = seasonManager.getCurrentSeason(guildId);
            if (!seasonName) continue;

            const cfg = seasonLeaderboardManager.getGuildConfig(guildId);
            if (!cfg.enabled) continue;
            const now = Date.now();
            const intervalMs = (cfg.updateIntervalMinutes || 15) * 60 * 1000;
            if (now - (cfg.lastAutoUpdate || 0) < intervalMs) {
                continue;
            }

            // Refresh season stats from live economy/game data
            await seasonManager.refreshSeasonStats(
                guildId,
                seasonName,
                (userId) => ({
                    username: guild.members.cache.get(userId)?.user.username || 'Unknown User',
                    balance: economyManager.getUserData(guildId, userId).balance,
                    xp: economyManager.getUserData(guildId, userId).xp,
                    level: economyManager.getUserData(guildId, userId).level,
                    seasonalCoins: economyManager.getUserData(guildId, userId).seasonalCoins,
                    gambling: gameStatsManager.getStats(userId)
                })
            );

            // Prune inactive players
            await seasonManager.pruneInactivePlayers(guildId, seasonName, cfg.pruneDays || 30);

            try {
                const season = seasonManager.getSeason(guildId, seasonName);
                if (season && !season.isActive && !season.summaryPosted) {
                    const winners = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', 3);
                    const payouts = cfg.payouts || [];
                    const rewardRoles = cfg.rewardRoles || [];

                    for (let i = 0; i < winners.length; i++) {
                        const winner = winners[i];
                        const payout = payouts[i] || 0;
                        if (payout > 0) {
                            await economyManager.addBalance(guildId, winner.userId, payout);
                        }

                        const roleId = rewardRoles[i];
                        if (roleId) {
                            const member = await fetchMemberSafe(guild, winner.userId);
                            const role = guild.roles.cache.get(roleId);
                            if (member && role) {
                                await member.roles.add(role).catch(() => null);
                            }
                        }
                    }

                    const summaryEmbed = await seasonLeaderboardManager.generateSeasonSummaryEmbed(guildId, seasonManager, seasonName);
                    if (summaryEmbed) {
                        await channel.send({ embeds: [summaryEmbed] });
                        await seasonManager.markSeasonSummaryPosted(guildId, seasonName);
                    }
                }

                const embeds = await seasonLeaderboardManager.generateSeasonEmbeds(guildId, seasonManager, seasonName, client);
                
                if (embeds.length === 0) continue;

                const existingMessageId = seasonLeaderboardManager.getLeaderboardMessage(guildId);
                const totalPages = embeds.length;
                const components = totalPages > 1
                    ? [buildLeaderboardPageComponents(guildId, 0, totalPages)]
                    : [];

                let leaderboardMessage = null;
                let messageEdited = false;

                // Try to edit existing message
                if (existingMessageId) {
                    try {
                        const msg = await withTimeout(channel.messages.fetch(existingMessageId), 5000);
                        if (msg) {
                            await withTimeout(msg.edit({ embeds: [embeds[0]], components }), 5000);
                            leaderboardMessage = msg;
                            messageEdited = true;
                            console.log(`✅ Edited existing leaderboard message ${existingMessageId} for guild ${guildId}`);
                        }
                    } catch (error) {
                        console.warn(`Could not fetch/edit message ${existingMessageId}: ${error.message}`);
                    }
                }

                // If couldn't edit, create new message
                if (!leaderboardMessage) {
                    try {
                        leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
                        console.log(`✅ Created new leaderboard message ${leaderboardMessage.id} for guild ${guildId}`);
                    } catch (error) {
                        console.error(`Failed to send leaderboard message for guild ${guildId}:`, error);
                        continue;
                    }
                }

                // Always save the messageId for next cycle
                cfg.messageId = leaderboardMessage.id;
                cfg.lastAutoUpdate = Date.now();
                await seasonLeaderboardManager.save();
                seasonLeaderboardManager.setPageCache(guildId, {
                    embeds,
                    messageId: leaderboardMessage.id,
                    channelId: channel.id
                });

                if (messageEdited) {
                    console.log(`✅ Updated leaderboard message for guild ${guildId}`);
                } else {
                    console.log(`✅ Created new leaderboard message for guild ${guildId}`);
                }
            } catch (error) {
                console.error(`Error updating leaderboards for guild ${guildId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in leaderboard update task:', error);
    }
}

function buildLeaderboardPageComponents(guildId, page, totalPages) {
    const prevPage = Math.max(0, page - 1);
    const nextPage = Math.min(totalPages - 1, page + 1);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${prevPage}`)
            .setLabel('⬅️ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${nextPage}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${page}`)
            .setLabel(`Page ${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    );
}