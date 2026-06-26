const path = require('path');
const fs = require('fs');
require('dotenv').config({
    path: path.join(__dirname, '.env'),
    override: true
});

const INSTANCE_LOCK_FILE = path.join(__dirname, '.discord-bot.lock');

function isPidRunning(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code === 'EPERM';
    }
}

function readLockPid() {
    try {
        const raw = fs.readFileSync(INSTANCE_LOCK_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Number(parsed?.pid) || null;
    } catch {
        return null;
    }
}

function releaseInstanceLock() {
    try {
        const lockPid = readLockPid();
        if (!lockPid || lockPid === process.pid) {
            fs.unlinkSync(INSTANCE_LOCK_FILE);
        }
    } catch {
        // Ignore lock release errors during shutdown.
    }
}

function acquireSingleInstanceLock() {
    const allowMultiple = String(process.env.ALLOW_MULTIPLE_BOT_INSTANCES || '').toLowerCase() === 'true';
    if (allowMultiple) return;

    const existingPid = readLockPid();
    if (existingPid && existingPid !== process.pid && isPidRunning(existingPid)) {
        console.error(`❌ Another bot instance is already running (PID ${existingPid}). Exiting to prevent double boot.`);
        process.exit(1);
    }

    if (existingPid && !isPidRunning(existingPid)) {
        try {
            fs.unlinkSync(INSTANCE_LOCK_FILE);
        } catch {
            // Continue and attempt to create a fresh lock.
        }
    }

    try {
        fs.writeFileSync(INSTANCE_LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
    } catch (error) {
        if (error?.code === 'EEXIST') {
            const lockPid = readLockPid();
            console.error(`❌ Bot lock file already exists${lockPid ? ` (PID ${lockPid})` : ''}. Exiting to prevent double boot.`);
            process.exit(1);
        }
        throw error;
    }

    process.on('exit', releaseInstanceLock);
}

acquireSingleInstanceLock();

// ── Environment variable validation ───────────────────────────────────────────
(function validateEnv() {
    const REQUIRED = ['DISCORD_TOKEN'];
    const OPTIONAL_WARN = ['CLIENT_ID', 'DASHBOARD_PORT', 'SESSION_SECRET'];
    const missing = REQUIRED.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.error(`\x1b[31m❌ Missing required environment variables: ${missing.join(', ')}\nPlease set them in your .env file.\x1b[0m`);
        process.exit(1);
    }
    const missingOpt = OPTIONAL_WARN.filter(k => !process.env[k]);
    if (missingOpt.length > 0) {
        console.warn(`\x1b[33m⚠️ Optional env vars not set (features may be limited): ${missingOpt.join(', ')}\x1b[0m`);
    }
})();
// ─────────────────────────────────────────────────────────────────────────────

// ── Timestamp console override ────────────────────────────────────────────────
(function patchConsole() {
    const getTimestamp = () => {
        const now = new Date();
        const dd   = String(now.getDate()).padStart(2, '0');
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const hh   = String(now.getHours()).padStart(2, '0');
        const min  = String(now.getMinutes()).padStart(2, '0');
        const ss   = String(now.getSeconds()).padStart(2, '0');
        return `[${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}]`;
    };

    const PREFIX = '\x1b[90m'; // dark-grey
    const RESET  = '\x1b[0m';

    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            original(`${PREFIX}${getTimestamp()}${RESET}`, ...args);
        };
    });
})();
// ─────────────────────────────────────────────────────────────────────────────

const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, BaseInteraction, MessageFlags } = require('discord.js');
const CommandHandler = require('./utils/commandHandler');
const EventHandler = require('./utils/eventHandler');
const SlashCommandHandler = require('./utils/slashCommandHandler');
const settingsManager = require('./utils/settingsManager');
const languageManager = require('./utils/languageManager');
const databaseManager = require('./utils/databaseManager');
const commandPermissionsManager = require('./utils/commandPermissionsManager');
const { dashboardPermissionsManager } = require('./utils/dashboardPermissionsManager');
const { isDevModeEnabled } = require('./utils/devMode');
const { fetchMemberSafe, withTimeout } = require('./utils/discordFetch');
const { notifyOwnerIfUpdated } = require('./utils/updateNotifier');

// ── Lazy-loaded managers (loaded on demand, not at startup) ──────────────────
let economyManager, moderationManager, gameStatsManager, statsManager;
let reactionRoleManager, starboardManager, customCommandManager, ticketManager;
let relationshipManager, achievementManager, analyticsManager;
let musicPlaylistManager, enhancedAIManager, levelRewardsManager;
let suggestionManager, shopManager, afkManager, voiceRewardsManager;
let raidProtectionManager, scheduledMessagesManager, birthdayManager;
let customRoleShop, activityTracker, serverMilestones, seasonManager;
let seasonLeaderboardManager, autoUpdateManager;
let Dashboard; // Lazy-loaded only when DASHBOARD_ENABLED=true

function lazyLoadManager(name) {
    if (name === 'economyManager') return (economyManager = economyManager || require('./utils/economyManager'));
    if (name === 'moderationManager') return (moderationManager = moderationManager || require('./utils/moderationManager'));
    if (name === 'gameStatsManager') return (gameStatsManager = gameStatsManager || require('./utils/gameStatsManager'));
    if (name === 'statsManager') return (statsManager = statsManager || require('./utils/statsManager'));
    if (name === 'reactionRoleManager') return (reactionRoleManager = reactionRoleManager || require('./utils/reactionRoleManager'));
    if (name === 'starboardManager') return (starboardManager = starboardManager || require('./utils/starboardManager'));
    if (name === 'customCommandManager') return (customCommandManager = customCommandManager || require('./utils/customCommandManager'));
    if (name === 'ticketManager') return (ticketManager = ticketManager || require('./utils/ticketManager'));
    if (name === 'relationshipManager') return (relationshipManager = relationshipManager || require('./utils/relationshipManager'));
    if (name === 'achievementManager') return (achievementManager = achievementManager || require('./utils/achievementManager'));
    if (name === 'analyticsManager') return (analyticsManager = analyticsManager || require('./utils/analyticsManager'));
    if (name === 'musicPlaylistManager') return (musicPlaylistManager = musicPlaylistManager || require('./utils/musicPlaylistManager'));
    if (name === 'enhancedAIManager') return (enhancedAIManager = enhancedAIManager || require('./utils/enhancedAIManager'));
    if (name === 'levelRewardsManager') return (levelRewardsManager = levelRewardsManager || require('./utils/levelRewardsManager'));
    if (name === 'suggestionManager') return (suggestionManager = suggestionManager || require('./utils/suggestionManager'));
    if (name === 'shopManager') return (shopManager = shopManager || require('./utils/shopManager'));
    if (name === 'afkManager') return (afkManager = afkManager || require('./utils/afkManager'));
    if (name === 'voiceRewardsManager') return (voiceRewardsManager = voiceRewardsManager || require('./utils/voiceRewardsManager'));
    if (name === 'raidProtectionManager') return (raidProtectionManager = raidProtectionManager || require('./utils/raidProtectionManager'));
    if (name === 'scheduledMessagesManager') return (scheduledMessagesManager = scheduledMessagesManager || require('./utils/scheduledMessagesManager'));
    if (name === 'birthdayManager') return (birthdayManager = birthdayManager || require('./utils/birthdayManager'));
    if (name === 'customRoleShop') return (customRoleShop = customRoleShop || require('./utils/customRoleShop'));
    if (name === 'activityTracker') return (activityTracker = activityTracker || require('./utils/activityTracker'));
    if (name === 'serverMilestones') return (serverMilestones = serverMilestones || require('./utils/serverMilestones'));
    if (name === 'seasonManager') return (seasonManager = seasonManager || require('./utils/seasonManager'));
    if (name === 'seasonLeaderboardManager') return (seasonLeaderboardManager = seasonLeaderboardManager || require('./utils/seasonLeaderboardManager'));
    if (name === 'autoUpdateManager') return (autoUpdateManager = autoUpdateManager || require('./utils/autoUpdateManager'));
}

// Expose lazy loader globally for other modules that need managers at runtime
const clientLazyLoader = lazyLoadManager;
// ─────────────────────────────────────────────────────────────────────────────

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

// Expose handlers on client for hot-reload and dashboard access
client.commandHandler = commandHandler;
client.slashCommandHandler = slashCommandHandler;

// Initialize new system managers (lightweight, no I/O)
const ErrorHandler = require('./utils/errorHandler');
const CooldownManager = require('./utils/cooldownManager');
const RateLimiter = require('./utils/rateLimiter');
const ShutdownManager = require('./utils/shutdownManager');
const InputValidator = require('./utils/inputValidator');
const Logger = require('./utils/logger');
const UptimeMonitor = require('./utils/uptimeMonitor');
const AuditLog = require('./utils/auditLog');
const WelcomeMessageManager = require('./utils/welcomeMessageManager');
const ReminderManager = require('./utils/reminderManager');
const RoleTemplateManager = require('./utils/roleTemplateManager');

const errorHandler = new ErrorHandler(client);
const cooldownManager = new CooldownManager();
const rateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
const shutdownManager = new ShutdownManager(client);
const logger = new Logger(client);
const uptimeMonitor = new UptimeMonitor(client);
const auditLog = new AuditLog();
const welcomeMessageManager = new WelcomeMessageManager();
const reminderManager = new ReminderManager(client);
const roleTemplateManager = new RoleTemplateManager();
const devModeEnabled = isDevModeEnabled();

// AutoBackup is deferred — constructed after handlers load to avoid sync I/O at startup
let autoBackup = null;

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
client.queues = require('./utils/queues'); // shared music queue Map used by all music commands

// ── Helper for timed init steps ──────────────────────────────────────────────
const runInitStep = async (label, initFn) => {
    const timerLabel = `⏱️ Init: ${label}`;
    console.time(timerLabel);
    await initFn();
    console.timeEnd(timerLabel);
    console.log(`✅ ${label} initialized!`);
};

// Load all commands and events
async function loadHandlers() {
    try {
        console.time('⏱️ Total startup init');

        // ═══════════════════════════════════════════════════════════════════════
        // Phase 1: Database connection (must be first, blocks everything)
        // ═══════════════════════════════════════════════════════════════════════
        await runInitStep('Database manager', () => databaseManager.init());

        // ═══════════════════════════════════════════════════════════════════════
        // Phase 2: Tier 1 managers — critical path, must complete before login
        // These are needed for prefix command handling and core bot functionality
        // ═══════════════════════════════════════════════════════════════════════
        await Promise.all([
            runInitStep('Settings manager', () => settingsManager.init()),
            runInitStep('Language manager', () => languageManager.init()),
            runInitStep('Command permissions manager', () => commandPermissionsManager.init()),
            runInitStep('Dashboard permissions manager', () => dashboardPermissionsManager.init()),
        ]);

        // ═══════════════════════════════════════════════════════════════════════
        // Phase 3: Load handlers in parallel (commands + events + slash commands)
        // ═══════════════════════════════════════════════════════════════════════
        await Promise.all([
            runInitStep('Command handler', () => commandHandler.loadCommands()),
            runInitStep('Event handler', () => eventHandler.loadEvents()),
            runInitStep('Slash command handler', () => slashCommandHandler.loadSlashCommands()),
        ]);

        // ═══════════════════════════════════════════════════════════════════════
        // Phase 4: Deferred AutoBackup construction (avoids sync I/O at startup)
        // ═══════════════════════════════════════════════════════════════════════
        const AutoBackup = require('./utils/autoBackup');
        autoBackup = new AutoBackup();
        client.autoBackup = autoBackup;

        console.timeEnd('⏱️ Total startup init');
        console.log('✅ Core handlers loaded successfully!');
        console.log('ℹ️ Non-critical managers will initialize after login (background).');
    } catch (error) {
        console.error('❌ Error loading handlers:', error);
        errorHandler.logError('STARTUP_ERROR', error);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 5: Tier 2 managers — initialize AFTER login, in background
// These are non-critical and shouldn't block the bot from being ready
// ═══════════════════════════════════════════════════════════════════════════════
async function initTier2Managers() {
    console.time('⏱️ Tier 2 managers init');
    
    const { minecraftStatusManager } = require('./utils/minecraftStatusManager');

    await Promise.all([
        runInitStep('Economy manager', () => lazyLoadManager('economyManager').init()),
        runInitStep('Moderation manager', () => lazyLoadManager('moderationManager').init()),
        runInitStep('Game stats manager', () => lazyLoadManager('gameStatsManager').init()),
        runInitStep('Stats manager', () => lazyLoadManager('statsManager').init()),
        runInitStep('Level rewards manager', () => lazyLoadManager('levelRewardsManager').init()),
        runInitStep('Suggestion manager', () => lazyLoadManager('suggestionManager').init()),
        runInitStep('Shop manager', () => lazyLoadManager('shopManager').init()),
        runInitStep('AFK manager', () => lazyLoadManager('afkManager').init()),
        runInitStep('Voice rewards manager', () => lazyLoadManager('voiceRewardsManager').init()),
        runInitStep('Raid protection manager', () => lazyLoadManager('raidProtectionManager').init()),
        runInitStep('Birthday manager', () => lazyLoadManager('birthdayManager').init()),
        runInitStep('Minecraft status manager', () => minecraftStatusManager.init(client)),
        runInitStep('Achievement manager', () => lazyLoadManager('achievementManager').init()),
        runInitStep('Scheduled messages manager', () => lazyLoadManager('scheduledMessagesManager').init(client)),
        runInitStep('Custom role shop', () => lazyLoadManager('customRoleShop').init()),
        runInitStep('Activity tracker', () => lazyLoadManager('activityTracker').init()),
        runInitStep('Server milestones', () => lazyLoadManager('serverMilestones').init()),
        runInitStep('Season manager', () => lazyLoadManager('seasonManager').init()),
        runInitStep('Season leaderboard manager', () => lazyLoadManager('seasonLeaderboardManager').init()),
        runInitStep('Reaction role manager', () => lazyLoadManager('reactionRoleManager').init()),
        runInitStep('Starboard manager', () => lazyLoadManager('starboardManager').init()),
        runInitStep('Custom command manager', () => lazyLoadManager('customCommandManager').init()),
        runInitStep('Ticket manager', () => lazyLoadManager('ticketManager').init()),
        runInitStep('Relationship manager', () => lazyLoadManager('relationshipManager').init()),
        runInitStep('Analytics manager', () => lazyLoadManager('analyticsManager').init()),
        runInitStep('Music playlist manager', () => lazyLoadManager('musicPlaylistManager').init()),
        runInitStep('Enhanced AI manager', () => lazyLoadManager('enhancedAIManager').init()),
    ]);

    console.timeEnd('⏱️ Tier 2 managers init');
    logger.success('All tier 2 managers initialized');
}

// Load handlers before logging in
let seasonLeaderboardTaskRunning = false;
let quarterlySeasonCheckRunning = false;
let lastQuarterlySeasonCheck = 0;
let seasonLeaderboardIntervalHandle = null;
let quarterlySeasonIntervalHandle = null;
let readyTasksStarted = false;
const seasonLeaderboardLastRunByGuild = new Map();

// Setup shutdown handlers
shutdownManager.onShutdown(async () => {
    logger.info('Running pre-shutdown cleanup tasks');
    
    // Create final backup
    if (autoBackup) {
        const backup = autoBackup.createBackup('shutdown');
        if (backup) {
            logger.info('Final shutdown backup created', { backup: backup.name });
        }
    }

    await databaseManager.close();
    logger.info('Database manager closed');
});

shutdownManager.setShutdownTimeout(30000); // 30 second timeout

loadHandlers().then(() => {
    if (devModeEnabled) {
        console.log('🧪 DEV_MODE: ON (MongoDB sync + seasonal leaderboard auto-updates are disabled)');
    } else {
        console.log('✅ DEV_MODE: OFF');
    }

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
        if (readyTasksStarted) {
            return;
        }

        readyTasksStarted = true;

        // Move non-critical ready work off the first ready tick
        setTimeout(async () => {
            console.log(`✅ Bot startup coordinator running as ${client.user.tag}`);

            // ── Tier 2 managers: initialize in background (don't block ready) ──
            initTier2Managers().catch(err => {
                console.error('Error initializing tier 2 managers:', err);
            });

            // ── Deferred MongoDB startup sync ──
            databaseManager.deferredStartupSync().catch(err => {
                console.error('Error in deferred startup sync:', err);
            });

            // ── Non-critical ready tasks (don't block each other) ──
            
            // Update notification (fire and forget)
            notifyOwnerIfUpdated(client).catch(error => {
                console.error('Error sending update notification DM:', error);
            });

            // Auto updater (fire and forget)
            const aum = lazyLoadManager('autoUpdateManager');
            if (aum && aum.start) {
                aum.start().catch(error => {
                    console.error('Error starting auto updater:', error);
                });
            }

            // Migrate usernames in existing seasons (fire and forget — no longer blocks)
            const sm = lazyLoadManager('seasonManager');
            if (sm && sm.migrateUsernames) {
                sm.migrateUsernames(client).then(migrated => {
                    if (migrated > 0) {
                        console.log(`✅ Migrated ${migrated} usernames in seasons`);
                    }
                }).catch(error => {
                    console.error('Error migrating season usernames:', error);
                });
            }

            // Register slash commands (fire and forget — no longer blocks)
            slashCommandHandler.registerCommands().then(() => {
                console.log('✅ Slash commands registered');
            }).catch(error => {
                console.error('Error registering slash commands:', error);
            });

            // Dashboard (only if enabled)
            if (process.env.DASHBOARD_ENABLED === 'true') {
                try {
                    Dashboard = Dashboard || require('./dashboard/server');
                    const dashboard = new Dashboard(client);
                    dashboard.start();
                } catch (error) {
                    console.error('Error starting dashboard:', error);
                }
            }

            // Start season leaderboard update task (runs every minute, respects per-guild interval)
            if (!devModeEnabled) {
                if (!seasonLeaderboardIntervalHandle) {
                    seasonLeaderboardIntervalHandle = setInterval(async () => {
                        if (seasonLeaderboardTaskRunning) return;
                        seasonLeaderboardTaskRunning = true;
                        try {
                            await updateSeasonLeaderboards(client);
                        } finally {
                            seasonLeaderboardTaskRunning = false;
                        }
                    }, 60 * 1000); // 1 minute
                }
            } else {
                console.log('🧪 DEV_MODE: Skipping scheduled season leaderboard updates.');
            }

            // Start quarterly season auto-creation task (runs every 6 hours, checks once per day)
            if (!quarterlySeasonIntervalHandle) {
                quarterlySeasonIntervalHandle = setInterval(async () => {
                    if (quarterlySeasonCheckRunning) return;
                    const now = Date.now();
                    // Only check once per day (86400000 ms = 24 hours)
                    if (now - lastQuarterlySeasonCheck < 24 * 60 * 60 * 1000) return;
                    
                    quarterlySeasonCheckRunning = true;
                    try {
                        const sm2 = lazyLoadManager('seasonManager');
                        await sm2.autoCreateQuarterlySeasons(client, client.user.id);
                        lastQuarterlySeasonCheck = now;
                    } catch (error) {
                        console.error('Error in quarterly season check:', error);
                    } finally {
                        quarterlySeasonCheckRunning = false;
                    }
                }, 6 * 60 * 60 * 1000); // 6 hours
            }

            // Initial update (fire and forget)
            if (!devModeEnabled && !seasonLeaderboardTaskRunning) {
                seasonLeaderboardTaskRunning = true;
                updateSeasonLeaderboards(client).finally(() => {
                    seasonLeaderboardTaskRunning = false;
                });
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
    if (devModeEnabled) {
        return;
    }

    try {
        const slm = lazyLoadManager('seasonLeaderboardManager');
        const sm = lazyLoadManager('seasonManager');
        const em = lazyLoadManager('economyManager');
        const gsm = lazyLoadManager('gameStatsManager');

        const guildConfigs = slm.config;
        let schedulerStateChanged = false;

        for (const guildId in guildConfigs) {
            const config = guildConfigs[guildId];
            if (!config.channelId) continue;

            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) continue;

            const seasonName = sm.getCurrentSeason(guildId);
            if (!seasonName) continue;

            const cfg = slm.getGuildConfig(guildId);
            if (!cfg.enabled) continue;
            const now = Date.now();
            const intervalMs = (cfg.updateIntervalMinutes || 15) * 60 * 1000;
            let nextAutoUpdateAt = Number(cfg.nextAutoUpdateAt) || 0;
            const existingMessageId = slm.getLeaderboardMessage(guildId);
            const inMemoryLastAutoUpdate = Number(seasonLeaderboardLastRunByGuild.get(guildId)) || 0;

            // Handle bad host clock / future timestamps so updates don't get stuck forever
            if ((cfg.lastAutoUpdate || 0) > now + (5 * 60 * 1000)) {
                cfg.lastAutoUpdate = 0;
                cfg.nextAutoUpdateAt = 0;
                nextAutoUpdateAt = 0;
                schedulerStateChanged = true;
            }

            if (!nextAutoUpdateAt && (cfg.lastAutoUpdate || 0) > 0) {
                const computedNextAutoUpdateAt = Number(cfg.lastAutoUpdate) + intervalMs;
                if (computedNextAutoUpdateAt > now) {
                    cfg.nextAutoUpdateAt = computedNextAutoUpdateAt;
                    nextAutoUpdateAt = computedNextAutoUpdateAt;
                    schedulerStateChanged = true;
                }
            }

            if (inMemoryLastAutoUpdate > 0) {
                const effectiveLastAutoUpdate = Math.max(Number(cfg.lastAutoUpdate) || 0, inMemoryLastAutoUpdate);
                if (effectiveLastAutoUpdate !== (Number(cfg.lastAutoUpdate) || 0)) {
                    cfg.lastAutoUpdate = effectiveLastAutoUpdate;
                    schedulerStateChanged = true;
                }

                if (!nextAutoUpdateAt || nextAutoUpdateAt < effectiveLastAutoUpdate + intervalMs) {
                    cfg.nextAutoUpdateAt = effectiveLastAutoUpdate + intervalMs;
                    nextAutoUpdateAt = cfg.nextAutoUpdateAt;
                    schedulerStateChanged = true;
                }
            }

            // Use the Discord message timestamp as a fallback source of truth when
            // persisted scheduler state is stale or missing.
            if (!nextAutoUpdateAt && existingMessageId) {
                try {
                    const existingMessage = await withTimeout(
                        slm.findLeaderboardMessage(channel, guildId, existingMessageId),
                        5000
                    );
                    const lastMessageUpdateAt = Number(existingMessage?.editedTimestamp || existingMessage?.createdTimestamp) || 0;

                    if (lastMessageUpdateAt > 0 && now - lastMessageUpdateAt < intervalMs) {
                        cfg.messageId = existingMessage.id;
                        cfg.lastAutoUpdate = lastMessageUpdateAt;
                        cfg.nextAutoUpdateAt = lastMessageUpdateAt + intervalMs;
                        nextAutoUpdateAt = cfg.nextAutoUpdateAt;
                        seasonLeaderboardLastRunByGuild.set(guildId, lastMessageUpdateAt);
                        schedulerStateChanged = true;
                    }
                } catch {
                    // Ignore lookup failures and fall back to config timestamps.
                }
            }

            if (nextAutoUpdateAt > now) {
                continue;
            }

            if (now - (cfg.lastAutoUpdate || 0) < intervalMs) {
                cfg.nextAutoUpdateAt = (cfg.lastAutoUpdate || 0) + intervalMs;
                schedulerStateChanged = true;
                continue;
            }

            // Refresh season stats from live economy/game data
            await sm.refreshSeasonStats(
                guildId,
                seasonName,
                (userId) => ({
                    username: guild.members.cache.get(userId)?.user.username || 'Unknown User',
                    balance: em.getUserData(guildId, userId).balance,
                    xp: em.getUserData(guildId, userId).xp,
                    level: em.getUserData(guildId, userId).level,
                    seasonalCoins: em.getUserData(guildId, userId).seasonalCoins,
                    gambling: gsm.getStats(userId)
                })
            );

            // Prune inactive players
            await sm.pruneInactivePlayers(guildId, seasonName, cfg.pruneDays || 30);

            try {
                const season = sm.getSeason(guildId, seasonName);
                if (season && !season.isActive && !season.summaryPosted) {
                    const winners = sm.getSeasonLeaderboard(guildId, seasonName, 'balance', 3);
                    const payouts = cfg.payouts || [];
                    const rewardRoles = cfg.rewardRoles || [];

                    for (let i = 0; i < winners.length; i++) {
                        const winner = winners[i];
                        const payout = payouts[i] || 0;
                        if (payout > 0) {
                            await em.addBalance(guildId, winner.userId, payout);
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

                    const summaryEmbed = await slm.generateSeasonSummaryEmbed(guildId, sm, seasonName);
                    if (summaryEmbed) {
                        await channel.send({ embeds: [summaryEmbed] });
                        await sm.markSeasonSummaryPosted(guildId, seasonName);
                    }
                }

                const embeds = await slm.generateSeasonEmbeds(guildId, sm, seasonName, client);
                
                if (embeds.length === 0) continue;

                const totalPages = embeds.length;
                const components = totalPages > 1
                    ? [buildLeaderboardPageComponents(guildId, 0, totalPages)]
                    : [];

                let leaderboardMessage = null;
                let messageEdited = false;

                // Try to edit existing message
                try {
                    const msg = await withTimeout(slm.findLeaderboardMessage(channel, guildId, existingMessageId), 5000);
                    if (msg) {
                        await withTimeout(msg.edit({ embeds: [embeds[0]], components }), 5000);
                        leaderboardMessage = msg;
                        messageEdited = true;
                        console.log(`✅ Edited existing leaderboard message ${msg.id} for guild ${guildId}`);
                    }
                } catch (error) {
                    console.warn(`Could not fetch/edit leaderboard message for guild ${guildId}: ${error.message}`);
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
                cfg.nextAutoUpdateAt = cfg.lastAutoUpdate + intervalMs;
                seasonLeaderboardLastRunByGuild.set(guildId, cfg.lastAutoUpdate);
                schedulerStateChanged = true;
                await slm.save();
                slm.setPageCache(guildId, {
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

        if (schedulerStateChanged) {
            await slm.save();
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