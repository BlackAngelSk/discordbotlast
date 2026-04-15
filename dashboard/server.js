const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const databaseManager = require('../utils/databaseManager');
const settingsManager = require('../utils/settingsManager');
const moderationManager = require('../utils/moderationManager');
const loggingManager = require('../utils/loggingManager');
const inviteManager = require('../utils/inviteManager');
const economyManager = require('../utils/economyManager');
const customCommandManager = require('../utils/customCommandManager');
const commandPermissionsManager = require('../utils/commandPermissionsManager');
const statsManager = require('../utils/statsManager');
const ticketManager = require('../utils/ticketManager');
const analyticsManager = require('../utils/analyticsManager');
const liveAlertsManager = require('../utils/liveAlertsManager');
const suggestionManager = require('../utils/suggestionManager');
const reactionRoleManager = require('../utils/reactionRoleManager');
const roleMenuManager = require('../utils/roleMenuManager');
const tempVoiceManager = require('../utils/tempVoiceManager');
const voiceRewardsManager = require('../utils/voiceRewardsManager');
const raidProtectionManager = require('../utils/raidProtectionManager');
const starboardManager = require('../utils/starboardManager');
const { formatNumber } = require('../utils/helpers');
const dashboardRoutes = require('./routes');

const withTimeout = (promise, ms) => new Promise((resolve) => {
    const parsedMs = Number(ms);
    const timeoutMs = Number.isFinite(parsedMs) ? Math.max(1, parsedMs) : 3000;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
        .then(result => {
            clearTimeout(timer);
            resolve(result);
        })
        .catch(() => {
            clearTimeout(timer);
            resolve(null);
        });
});

const resolveGuildUsername = async (guild, userId) => {
    if (!guild) return `Unknown (${userId})`;
    const cached = guild.members?.cache?.get(userId);
    if (cached) return cached.user?.username || `Unknown (${userId})`;
    const member = await withTimeout(guild.members.fetch(userId).catch(() => null), 3000);
    return member ? member.user.username : `Unknown (${userId})`;
};

const resolveGlobalUsername = async (client, userId) => {
    const cached = client.users?.cache?.get(userId);
    if (cached) return cached.username || `Unknown (${userId})`;
    const user = await withTimeout(client.users.fetch(userId).catch(() => null), 3000);
    return user ? user.username : `Unknown (${userId})`;
};

const GIVEAWAYS_FILE = path.join(__dirname, '..', 'data', 'giveaways.json');
const DASHBOARD_AUDIT_FILE = path.join(__dirname, '..', 'data', 'dashboardAudit.json');
const BOT_UPDATE_STATE_FILE = path.join(__dirname, '..', 'data', 'botUpdateState.json');

let dashboardAuditWriteQueue = Promise.resolve();

const readJsonFile = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
};

const queueDashboardAuditEntry = (entry) => {
    dashboardAuditWriteQueue = dashboardAuditWriteQueue
        .then(async () => {
            let logs = [];

            try {
                const content = await fs.promises.readFile(DASHBOARD_AUDIT_FILE, 'utf8');
                logs = JSON.parse(content);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            logs.push(entry);
            if (logs.length > 500) {
                logs = logs.slice(-500);
            }

            await fs.promises.writeFile(DASHBOARD_AUDIT_FILE, JSON.stringify(logs, null, 2));
        })
        .catch((error) => {
            console.error('Dashboard audit log error:', error.message);
        });
};

const logDashboardAudit = (req, action, details = {}) => {
    queueDashboardAuditEntry({
        timestamp: new Date().toISOString(),
        userId: req.user?.id || 'unknown',
        username: req.user?.username || 'unknown',
        guildId: req.params?.guildId || details.guildId || null,
        action,
        details,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
    });
};

const collectDashboardCommands = (client, guildId) => {
    const merged = new Map();

    const upsert = (name, patch) => {
        const current = merged.get(name) || {
            name,
            description: '',
            category: 'other',
            usage: '',
            aliases: [],
            prefix: false,
            slash: false
        };

        merged.set(name, {
            ...current,
            ...patch,
            aliases: Array.from(new Set([...(current.aliases || []), ...(patch.aliases || [])]))
        });
    };

    for (const [lookupName, command] of client.commandHandler?.commands || new Map()) {
        if (!command?.name || lookupName !== command.name) continue; // skip aliases
        upsert(command.name, {
            description: command.description || '',
            category: command.category || 'other',
            usage: command.usage || '',
            aliases: Array.isArray(command.aliases) ? command.aliases : [],
            prefix: true
        });
    }

    for (const [name, command] of client.slashCommandHandler?.commands || new Map()) {
        upsert(name, {
            description: command?.data?.description || merged.get(name)?.description || '',
            category: command.category || merged.get(name)?.category || 'other',
            slash: true
        });
    }

    return Array.from(merged.values())
        .map((command) => ({
            ...command,
            enabled: commandPermissionsManager.isCommandEnabled(guildId, command.name),
            requiredRoleId: commandPermissionsManager.getRequiredRole(guildId, command.name)
        }))
        .sort((a, b) => {
            const catCompare = String(a.category).localeCompare(String(b.category));
            return catCompare !== 0 ? catCompare : a.name.localeCompare(b.name);
        });
};

class Dashboard {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.port = process.env.DASHBOARD_PORT || 3000;
        this.sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

        if (!process.env.SESSION_SECRET) {
            console.warn('Dashboard SESSION_SECRET is not set. Using an ephemeral secret for this process.');
        }
        
        // Bind middleware methods to preserve 'this' context
        this.checkAuth = this.checkAuth.bind(this);
        this.checkGuildAccess = this.checkGuildAccess.bind(this);
        this.checkOwnerAccess = this.checkOwnerAccess.bind(this);
        
        this.setupMiddleware();
        this.setupAuth();
        this.setupRoutes();
    }

    setupMiddleware() {
        const isProduction = process.env.NODE_ENV === 'production';

        if (isProduction) {
            this.app.set('trust proxy', 1);
        }

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));

        this.app.use(session({
            name: 'discordbot.sid',
            secret: this.sessionSecret,
            resave: false,
            saveUninitialized: false,
            proxy: isProduction,
            unset: 'destroy',
            cookie: {
                maxAge: 60000 * 60 * 24,
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction
            }
        }));

        this.app.use((req, res, next) => {
            res.locals.currentPath = req.path;
            next();
        });

        this.app.use(passport.initialize());
        this.app.use(passport.session());
    }

    setupAuth() {
        const callbackURL = process.env.DASHBOARD_CALLBACK || `http://localhost:${this.port}/callback`;
        
        console.log(`📍 OAuth2 Callback URL: ${callbackURL}`);
        console.log(`📍 Client ID: ${process.env.CLIENT_ID}`);

        passport.serializeUser((user, done) => done(null, user));
        passport.deserializeUser((obj, done) => done(null, obj));

        passport.use(new DiscordStrategy({
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: callbackURL,
            scope: ['identify', 'guilds']
        }, (accessToken, refreshToken, profile, done) => {
            return done(null, profile);
        }));
    }

    setupRoutes() {
        // Import the advanced dashboard routes
        dashboardRoutes(this.app, this.client, this.checkAuth, this.checkGuildAccess);

        // ── Health endpoint ───────────────────────────────────────────────────
        this.app.get('/health', (req, res) => {
            const botReady = this.client?.isReady?.() ?? false;
            const uptimeSeconds = process.uptime();
            const memUsage = process.memoryUsage();
            res.json({
                status: botReady ? 'ok' : 'starting',
                uptime: Math.floor(uptimeSeconds),
                ping: this.client?.ws?.ping ?? -1,
                guilds: this.client?.guilds?.cache?.size ?? 0,
                users: this.client?.users?.cache?.size ?? 0,
                memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
                timestamp: new Date().toISOString()
            });
        });
        // ─────────────────────────────────────────────────────────────────────

        // Home page
        this.app.get('/', (req, res) => {
            res.render('index', {
                user: req.user,
                client: this.client
            });
        });

        // Login
        this.app.get('/login', passport.authenticate('discord'));

        // OAuth callback
        this.app.get('/callback',
            passport.authenticate('discord', { failureRedirect: '/' }),
            (req, res) => res.redirect('/dashboard')
        );

        // Logout
        this.app.get('/logout', (req, res) => {
            req.logout(() => {
                res.redirect('/');
            });
        });

        // Dashboard - list servers
        this.app.get('/dashboard', this.checkAuth, (req, res) => {
            const adminPermission = PermissionFlagsBits.Administrator;
            const guilds = req.user.guilds.filter(guild => {
                if (!this.client.guilds.cache.has(guild.id)) {
                    return false;
                }

                try {
                    return (BigInt(guild.permissions) & adminPermission) === adminPermission;
                } catch {
                    return false;
                }
            });

            res.render('dashboard', {
                user: req.user,
                guilds: guilds,
                isBotOwner: this.isBotOwner(req.user?.id)
            });
        });

        // Bot owner settings page
        this.app.get('/dashboard/owner', this.checkAuth, this.checkOwnerAccess, (req, res) => {
            const syncStatus = databaseManager.getSyncStatus();
            const updateState = readJsonFile(BOT_UPDATE_STATE_FILE, null);
            const memoryUsage = process.memoryUsage();

            res.render('owner-settings', {
                user: req.user,
                syncStatus,
                updateState,
                ownerStatus: {
                    ownerId: process.env.BOT_OWNER_ID || null,
                    errorDmRecipientId: process.env.ERROR_DM_USER_ID || process.env.BOT_OWNER_ID || null,
                    dashboardPort: this.port,
                    dashboardCallback: process.env.DASHBOARD_CALLBACK || `http://localhost:${this.port}/callback`,
                    devMode: databaseManager.devMode,
                    storageMode: databaseManager.useDB,
                    isMongoConnected: databaseManager.useDB === 'mongodb' && !!databaseManager.db,
                    guildCount: this.client.guilds.cache.size,
                    userCount: this.client.users.cache.size,
                    ping: this.client.ws?.ping ?? -1,
                    uptimeSeconds: Math.floor(process.uptime()),
                    heapMemoryMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    rssMemoryMb: Math.round(memoryUsage.rss / 1024 / 1024)
                }
            });
        });

        // API: Update owner MongoDB sync settings
        this.app.post('/api/owner/settings/mongodb-sync', this.checkAuth, this.checkOwnerAccess, async (req, res) => {
            try {
                const { mode, intervalMinutes, startupSync, shutdownSync } = req.body;
                const updates = {};

                if (mode !== undefined) {
                    if (!['manual', 'interval'].includes(mode)) {
                        return res.status(400).json({ success: false, error: 'Mode must be manual or interval.' });
                    }

                    updates.mode = mode;
                }

                if (intervalMinutes !== undefined && intervalMinutes !== null && intervalMinutes !== '') {
                    const parsedMinutes = Number(intervalMinutes);
                    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 1440) {
                        return res.status(400).json({ success: false, error: 'Interval must be between 1 and 1440 minutes.' });
                    }

                    updates.intervalMs = Math.round(parsedMinutes * 60_000);
                }

                if (typeof startupSync === 'boolean') {
                    updates.startupSync = startupSync;
                }

                if (typeof shutdownSync === 'boolean') {
                    updates.shutdownSync = shutdownSync;
                }

                if (Object.keys(updates).length === 0) {
                    return res.status(400).json({ success: false, error: 'No owner settings were provided.' });
                }

                const syncStatus = await databaseManager.updateSyncSettings(updates);
                logDashboardAudit(req, 'OWNER_UPDATE_MONGODB_SYNC', {
                    mode: syncStatus.mode,
                    intervalMs: syncStatus.intervalMs,
                    startupSync: syncStatus.startupSync,
                    shutdownSync: syncStatus.shutdownSync
                });

                res.json({ success: true, syncStatus });
            } catch (error) {
                console.error('Error updating owner MongoDB sync settings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Trigger owner MongoDB sync now
        this.app.post('/api/owner/mongodb-sync/run', this.checkAuth, this.checkOwnerAccess, async (req, res) => {
            try {
                const result = await databaseManager.syncAllJsonToMongo({ force: true, reason: 'dashboard-owner' });
                const syncStatus = databaseManager.getSyncStatus();

                logDashboardAudit(req, 'OWNER_RUN_MONGODB_SYNC', {
                    failedCount: result.failedCount,
                    syncedCount: result.syncedCount,
                    skippedCount: result.skippedCount,
                    reason: 'dashboard-owner'
                });

                res.json({
                    success: result.failedCount === 0,
                    result,
                    syncStatus,
                    message: result.failedCount > 0
                        ? 'MongoDB sync completed with some issues.'
                        : 'MongoDB sync completed successfully.'
                });
            } catch (error) {
                console.error('Error running owner MongoDB sync:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Server settings page
        this.app.get('/dashboard/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                const settings = settingsManager.get(req.params.guildId);
                const modSettings = moderationManager.getAutomodSettings(req.params.guildId);
                const modLogChannel = moderationManager.getModLogChannel(req.params.guildId);
                const loggingChannel = await loggingManager.getLoggingChannel(req.params.guildId);
                const topInviters = await inviteManager.getLeaderboard(req.params.guildId, 5);
                const serverStats = await statsManager.getServerStats(req.params.guildId);
                const economyLeaderboard = economyManager.getLeaderboard(req.params.guildId, 'balance', 10);
                const customCommands = customCommandManager.getCommands(req.params.guildId);
                const allTickets = ticketManager.getGuildTickets(req.params.guildId);
                const activeTickets = Object.values(allTickets).filter(t => t.status === 'open').length;
                const liveAlerts = liveAlertsManager.getAlerts(req.params.guildId);
                const liveAlertsCount = (liveAlerts.twitch?.length || 0) + (liveAlerts.youtube?.length || 0);
                
                res.render('server', {
                    user: req.user,
                    guild: guild,
                    isBotOwner: this.isBotOwner(req.user?.id),
                    settings: settings,
                    modSettings: modSettings,
                    modLogChannel: modLogChannel,
                    loggingChannel: loggingChannel,
                    topInviters: topInviters,
                    serverStats: serverStats,
                    economyLeaderboard: economyLeaderboard,
                    customCommands: customCommands,
                    activeTickets: activeTickets,
                    liveAlertsCount: liveAlertsCount,
                    roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone'),
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0)
                });
            } catch (error) {
                console.error('Error loading server dashboard:', error);
                res.status(500).send('Error loading dashboard');
            }
        });

        // API: Update settings
        this.app.post('/api/settings/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const updates = req.body;
                const parseOptionalNumber = (value) => {
                    if (value === undefined || value === null || value === '') {
                        return undefined;
                    }

                    const parsed = Number(value);
                    return Number.isFinite(parsed) ? parsed : undefined;
                };

                // Update allowed fields
                const allowedFields = [
                    'djRole', 'autoRole', 
                    'welcomeChannel', 'welcomeMessage', 'welcomeEnabled',
                    'leaveChannel', 'leaveMessage', 'leaveEnabled'
                ];

                const settingsUpdates = {};

                allowedFields.forEach(field => {
                    if (updates[field] !== undefined) {
                        settingsUpdates[field] = updates[field];
                    }
                });

                // Handle prefixes (array)
                if (updates.prefixes !== undefined && Array.isArray(updates.prefixes)) {
                    settingsUpdates.prefixes = updates.prefixes;
                }

                if (Object.keys(settingsUpdates).length > 0) {
                    await settingsManager.setMultiple(guildId, settingsUpdates);
                }

                const settings = settingsManager.get(guildId);

                // Handle logging channel (allow clearing)
                if (updates.loggingChannel !== undefined) {
                    await loggingManager.setLoggingChannel(guildId, updates.loggingChannel || null);
                }

                // Handle auto-moderation settings
                const autoModUpdates = {};
                if (updates.autoModEnabled !== undefined) autoModUpdates.enabled = updates.autoModEnabled;
                if (updates.antiSpam !== undefined) autoModUpdates.antiSpam = updates.antiSpam;
                if (updates.antiInvite !== undefined) autoModUpdates.antiInvite = updates.antiInvite;
                if (updates.emojiOnly !== undefined) autoModUpdates.emojiOnly = updates.emojiOnly;
                const maxMentions = parseOptionalNumber(updates.maxMentions);
                const maxEmojis = parseOptionalNumber(updates.maxEmojis);
                if (maxMentions !== undefined) autoModUpdates.maxMentions = maxMentions;
                if (maxEmojis !== undefined) autoModUpdates.maxEmojis = maxEmojis;
                if (updates.badWords !== undefined) autoModUpdates.badWords = updates.badWords;

                if (Object.keys(autoModUpdates).length > 0) {
                    await moderationManager.updateAutomodSettings(guildId, autoModUpdates);
                }

                // Handle mod log channel (auto-mod logs)
                if (updates.modLogChannel !== undefined) {
                    moderationManager.setModLogChannel(guildId, updates.modLogChannel || null);
                }

                const modSettings = moderationManager.getAutomodSettings(guildId);
                res.json({ success: true, settings, modSettings });
            } catch (error) {
                console.error('Error updating settings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Reset settings
        this.app.post('/api/settings/:guildId/reset', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                await settingsManager.reset(req.params.guildId);
                const settings = settingsManager.get(req.params.guildId);
                res.json({ success: true, settings });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get server statistics
        this.app.get('/api/stats/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const stats = await statsManager.getServerStats(req.params.guildId);
                res.json({ success: true, stats });
            } catch (error) {
                console.error('Error fetching stats:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get economy leaderboard
        this.app.get('/api/economy/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const type = req.query.type || 'balance';
                const limit = parseInt(req.query.limit) || 10;
                let leaderboard = economyManager.getLeaderboard(guildId, type, limit);
                
                // Resolve usernames for leaderboard
                if (guild) {
                    leaderboard = await Promise.all(leaderboard.map(async (user) => {
                        try {
                            const member = await guild.members.fetch(user.userId).catch(() => null);
                            return {
                                ...user,
                                username: member ? member.user.username : `Unknown (${user.userId})`
                            };
                        } catch {
                            return {
                                ...user,
                                username: `Unknown (${user.userId})`
                            };
                        }
                    }));
                }
                
                res.json({ success: true, leaderboard });
            } catch (error) {
                console.error('Error fetching economy leaderboard:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get custom commands
        this.app.get('/api/commands/:guildId', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                const commands = customCommandManager.getCommands(req.params.guildId);
                res.json({ success: true, commands });
            } catch (error) {
                console.error('Error fetching custom commands:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add custom command
        this.app.post('/api/commands/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { name, response } = req.body;
                
                if (!name || !response) {
                    return res.status(400).json({ success: false, error: 'Name and response are required' });
                }

                if (name.length > 20) {
                    return res.status(400).json({ success: false, error: 'Command name must be 20 characters or less' });
                }

                if (response.length > 2000) {
                    return res.status(400).json({ success: false, error: 'Response must be 2000 characters or less' });
                }

                // Check if command already exists
                const existing = customCommandManager.getCommand(req.params.guildId, name.toLowerCase());
                if (existing) {
                    return res.status(400).json({ success: false, error: 'Command already exists' });
                }

                await customCommandManager.addCommand(req.params.guildId, name.toLowerCase(), response);
                res.json({ success: true, message: 'Command added successfully' });
            } catch (error) {
                console.error('Error adding custom command:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Delete custom command
        this.app.delete('/api/commands/:guildId/:commandName', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const command = customCommandManager.getCommand(req.params.guildId, req.params.commandName);
                
                if (!command) {
                    return res.status(404).json({ success: false, error: 'Command not found' });
                }

                await customCommandManager.removeCommand(req.params.guildId, req.params.commandName);
                res.json({ success: true, message: 'Command deleted successfully' });
            } catch (error) {
                console.error('Error deleting custom command:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get moderation warnings
        this.app.get('/api/moderation/:guildId/warnings', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                const userId = req.query.userId;
                let warnings;
                
                if (userId) {
                    warnings = moderationManager.getUserWarnings(req.params.guildId, userId);
                } else {
                    warnings = moderationManager.getAllWarnings(req.params.guildId);
                }
                
                res.json({ success: true, warnings });
            } catch (error) {
                console.error('Error fetching warnings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get active tickets
        this.app.get('/api/tickets/:guildId', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                const allTickets = ticketManager.getGuildTickets(req.params.guildId);
                const tickets = Object.entries(allTickets)
                    .map(([id, ticket]) => ({ id, ...ticket }))
                    .filter(t => req.query.status ? t.status === req.query.status : t.status === 'open')
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                res.json({ success: true, tickets });
            } catch (error) {
                console.error('Error fetching tickets:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Update user balance (admin only)
        this.app.post('/api/economy/:guildId/balance', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { userId, amount, action } = req.body;
                
                if (!userId || !amount || !action) {
                    return res.status(400).json({ success: false, error: 'Missing required fields' });
                }

                const amountNum = parseInt(amount);
                if (isNaN(amountNum) || amountNum <= 0) {
                    return res.status(400).json({ success: false, error: 'Invalid amount' });
                }

                let result;
                if (action === 'add') {
                    result = await economyManager.addMoney(req.params.guildId, userId, amountNum);
                } else if (action === 'remove') {
                    result = await economyManager.removeMoney(req.params.guildId, userId, amountNum);
                } else {
                    return res.status(400).json({ success: false, error: 'Invalid action' });
                }

                res.json({ success: true, newBalance: result });
            } catch (error) {
                console.error('Error updating balance:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Live alerts
        this.app.get('/api/live-alerts/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const alerts = liveAlertsManager.getAlerts(guildId);

                const twitch = (alerts.twitch || []).map(entry => ({
                    ...entry,
                    discordChannelName: guild?.channels?.cache?.get(entry.channelId)?.name || `Unknown (${entry.channelId})`,
                    roleName: entry.roleId ? (guild?.roles?.cache?.get(entry.roleId)?.name || `Unknown (${entry.roleId})`) : null
                }));

                const youtube = (alerts.youtube || []).map(entry => ({
                    ...entry,
                    discordChannelName: guild?.channels?.cache?.get(entry.discordChannelId)?.name || `Unknown (${entry.discordChannelId})`,
                    roleName: entry.roleId ? (guild?.roles?.cache?.get(entry.roleId)?.name || `Unknown (${entry.roleId})`) : null
                }));

                res.json({ success: true, alerts: { twitch, youtube } });
            } catch (error) {
                console.error('Error fetching live alerts:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/live-alerts/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const { platform, identifier, discordChannelId, roleId } = req.body;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!platform || !identifier || !discordChannelId) {
                    return res.status(400).json({ success: false, error: 'Platform, identifier, and channel are required' });
                }

                const normalizedPlatform = String(platform).toLowerCase();
                const normalizedIdentifier = String(identifier).trim();

                if (!['twitch', 'youtube'].includes(normalizedPlatform)) {
                    return res.status(400).json({ success: false, error: 'Platform must be twitch or youtube' });
                }

                const channel = guild.channels.cache.get(discordChannelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const safeRoleId = roleId && guild.roles.cache.has(roleId) ? roleId : null;

                if (normalizedPlatform === 'twitch') {
                    await liveAlertsManager.addTwitchAlert(guildId, normalizedIdentifier, discordChannelId, safeRoleId);
                } else {
                    await liveAlertsManager.addYouTubeAlert(guildId, normalizedIdentifier, discordChannelId, safeRoleId);
                }

                res.json({ success: true, message: 'Live alert saved successfully' });
            } catch (error) {
                console.error('Error saving live alert:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.delete('/api/live-alerts/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const { platform, identifier } = req.body;

                if (!platform || !identifier) {
                    return res.status(400).json({ success: false, error: 'Platform and identifier are required' });
                }

                const normalizedPlatform = String(platform).toLowerCase();
                const normalizedIdentifier = String(identifier).trim();

                if (normalizedPlatform === 'twitch') {
                    await liveAlertsManager.removeTwitchAlert(guildId, normalizedIdentifier);
                } else if (normalizedPlatform === 'youtube') {
                    await liveAlertsManager.removeYouTubeAlert(guildId, normalizedIdentifier);
                } else {
                    return res.status(400).json({ success: false, error: 'Platform must be twitch or youtube' });
                }

                res.json({ success: true, message: 'Live alert removed successfully' });
            } catch (error) {
                console.error('Error removing live alert:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Community tools dashboard
        this.app.get('/dashboard/:guildId/community', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const suggestionSettings = suggestionManager.getSettings(guildId);

                const reactionRoles = Object.entries(reactionRoleManager.data || {})
                    .filter(([key]) => key.startsWith(`${guildId}_`))
                    .flatMap(([key, mapping]) => {
                        const messageId = key.slice(guildId.length + 1);
                        return Object.entries(mapping || {}).map(([emoji, entry]) => {
                            const normalizedEntry = reactionRoleManager.normalizeEntry(entry);
                            const roleId = normalizedEntry?.roleId || null;
                            const channelId = normalizedEntry?.channelId || null;

                            return {
                            messageId,
                            emoji,
                            roleId,
                            roleName: roleId ? (guild?.roles?.cache?.get(roleId)?.name || `Unknown (${roleId})`) : 'Unknown role',
                            channelId,
                            channelName: channelId ? (guild?.channels?.cache?.get(channelId)?.name || `Unknown (${channelId})`) : 'Unknown channel',
                            messageContent: normalizedEntry?.messageContent || null,
                            messageUrl: normalizedEntry?.messageUrl || `https://discord.com/channels/${guildId}/${channelId || '@me'}/${messageId}`
                        };
                        });
                    });

                const roleMenus = roleMenuManager.getMenus(guildId).map(menu => ({
                    ...menu,
                    roleCount: Array.isArray(menu.roles) ? menu.roles.length : 0,
                    channelName: menu.channelId ? (guild?.channels?.cache?.get(menu.channelId)?.name || `Unknown (${menu.channelId})`) : null
                }));

                const giveaways = readJsonFile(GIVEAWAYS_FILE, [])
                    .filter(entry => entry.guildId === guildId)
                    .sort((a, b) => Number(b.endTime || 0) - Number(a.endTime || 0));

                let suggestions = suggestionManager.getGuildSuggestions(guildId)
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                    .slice(0, 50);

                suggestions = await Promise.all(suggestions.map(async (entry) => ({
                    ...entry,
                    username: await resolveGuildUsername(guild, entry.userId)
                })));

                res.render('community', {
                    guild,
                    user: req.user,
                    reactionRoles,
                    roleMenus,
                    giveaways,
                    suggestions,
                    suggestionSettings,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone'),
                    guildEmojis: Array.from(guild.emojis.cache.values())
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(emoji => ({
                            id: emoji.id,
                            name: emoji.name,
                            animated: emoji.animated,
                            value: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
                            preview: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
                        }))
                });
            } catch (error) {
                console.error('Community tools page error:', error);
                res.status(500).send('Error loading community tools');
            }
        });

        this.app.post('/api/community/:guildId/reaction-roles', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = this.client.guilds.cache.get(guildId);
                const { emoji, roleId, channelId, messageContent } = req.body;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!emoji || !roleId || !channelId || !messageContent) {
                    return res.status(400).json({ success: false, error: 'Channel, message, emoji, and role are required' });
                }

                const trimmedEmoji = String(emoji).trim();
                const trimmedRoleId = String(roleId).trim();
                const trimmedChannelId = String(channelId).trim();
                const trimmedMessageContent = String(messageContent).trim();

                if (!trimmedMessageContent) {
                    return res.status(400).json({ success: false, error: 'Message content cannot be empty' });
                }

                const role = guild.roles.cache.get(trimmedRoleId);
                if (!role || role.name === '@everyone') {
                    return res.status(400).json({ success: false, error: 'Please choose a valid role' });
                }

                const channel = guild.channels.cache.get(trimmedChannelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
                if (!botMember) {
                    return res.status(500).json({ success: false, error: 'Bot member is unavailable in this guild' });
                }

                const channelPermissions = channel.permissionsFor(botMember);
                if (!channelPermissions?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.AddReactions)) {
                    return res.status(400).json({ success: false, error: 'Bot needs View Channel, Send Messages, and Add Reactions in the selected channel' });
                }

                if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.comparePositionTo(role) <= 0) {
                    return res.status(400).json({ success: false, error: 'Bot cannot manage the selected role because of missing Manage Roles permission or role hierarchy' });
                }

                const postedMessage = await channel.send({ content: trimmedMessageContent });

                try {
                    await postedMessage.react(trimmedEmoji);
                } catch (error) {
                    await postedMessage.delete().catch(() => null);
                    return res.status(400).json({ success: false, error: 'Bot could not add that emoji as a reaction. Use a valid emoji the bot can access.' });
                }

                await reactionRoleManager.addReactionRole(guildId, postedMessage.id, trimmedEmoji, trimmedRoleId, {
                    channelId: channel.id,
                    messageContent: postedMessage.content.slice(0, 180),
                    messageUrl: postedMessage.url
                });

                res.json({
                    success: true,
                    messageId: postedMessage.id,
                    messageUrl: postedMessage.url,
                    channelName: channel.name
                });
            } catch (error) {
                console.error('Error saving reaction role:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.delete('/api/community/:guildId/reaction-roles', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const { messageId, emoji } = req.body;

                if (!messageId || !emoji) {
                    return res.status(400).json({ success: false, error: 'Message ID and emoji are required' });
                }

                await reactionRoleManager.removeReactionRole(guildId, String(messageId).trim(), String(emoji).trim());
                res.json({ success: true });
            } catch (error) {
                console.error('Error removing reaction role:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/community/:guildId/suggestions/settings', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const isTrue = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

                await suggestionManager.updateSettings(guildId, {
                    enabled: isTrue(req.body.enabled),
                    autoThread: isTrue(req.body.autoThread),
                    votingEnabled: isTrue(req.body.votingEnabled),
                    channelId: req.body.channelId || null,
                    staffRoleId: req.body.staffRoleId || null
                });

                res.json({ success: true, settings: suggestionManager.getSettings(guildId) });
            } catch (error) {
                console.error('Error updating suggestion settings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/community/:guildId/suggestions/:suggestionId/status', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId, suggestionId } = req.params;
                const { status, reason } = req.body;

                if (!['pending', 'approved', 'denied'].includes(status)) {
                    return res.status(400).json({ success: false, error: 'Invalid status' });
                }

                const updated = await suggestionManager.updateSuggestionStatus(guildId, suggestionId, status, reason || null);
                if (!updated) {
                    return res.status(404).json({ success: false, error: 'Suggestion not found' });
                }

                res.json({ success: true });
            } catch (error) {
                console.error('Error updating suggestion status:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Voice tools dashboard
        this.app.get('/dashboard/:guildId/voice-tools', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const voiceSettings = voiceRewardsManager.getSettings(guildId);
                const hubChannelId = tempVoiceManager.getHub(guildId);
                const activeSessions = Object.keys(voiceRewardsManager.data.sessions?.[guildId] || {}).length;

                let leaderboard = voiceRewardsManager.getVoiceLeaderboard(guildId, 20);
                leaderboard = await Promise.all(leaderboard.map(async (entry) => ({
                    ...entry,
                    username: await resolveGuildUsername(guild, entry.userId)
                })));

                res.render('voice-tools', {
                    guild,
                    user: req.user,
                    voiceSettings,
                    hubChannelId,
                    activeSessions,
                    leaderboard,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 2)
                });
            } catch (error) {
                console.error('Voice tools page error:', error);
                res.status(500).send('Error loading voice tools');
            }
        });

        this.app.post('/api/voice-tools/:guildId/tempvc', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const hubChannelId = req.body.hubChannelId || null;

                if (hubChannelId) {
                    await tempVoiceManager.setHub(guildId, hubChannelId);
                } else {
                    await tempVoiceManager.removeHub(guildId);
                }

                res.json({ success: true, hubChannelId: tempVoiceManager.getHub(guildId) });
            } catch (error) {
                console.error('Error updating temp voice hub:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/voice-tools/:guildId/rewards', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const isTrue = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

                await voiceRewardsManager.updateSettings(guildId, {
                    enabled: isTrue(req.body.enabled),
                    xpPerMinute: Math.max(0, Number(req.body.xpPerMinute) || 0),
                    coinsPerHour: Math.max(0, Number(req.body.coinsPerHour) || 0),
                    minUsersRequired: Math.max(1, Number(req.body.minUsersRequired) || 1),
                    afkChannelExcluded: isTrue(req.body.afkChannelExcluded)
                });

                res.json({ success: true, settings: voiceRewardsManager.getSettings(guildId) });
            } catch (error) {
                console.error('Error updating voice rewards:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Safety center dashboard
        this.app.get('/dashboard/:guildId/safety', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const settings = settingsManager.get(guildId);
                const raidSettings = raidProtectionManager.getSettings(guildId);
                const raidStatus = raidProtectionManager.checkRaidAlert(guildId);
                const starboardEntries = Object.values(starboardManager.data?.[guildId] || {});

                res.render('safety', {
                    guild,
                    user: req.user,
                    settings,
                    raidSettings,
                    raidStatus,
                    featuredCount: starboardEntries.length,
                    locked: raidProtectionManager.isLocked(guildId),
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone')
                });
            } catch (error) {
                console.error('Safety page error:', error);
                res.status(500).send('Error loading safety center');
            }
        });

        this.app.post('/api/safety/:guildId/starboard', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const channelId = req.body.channelId || null;
                const threshold = Math.max(1, Number(req.body.threshold) || 3);

                await settingsManager.setMultiple(guildId, {
                    starboardChannel: channelId,
                    starboardThreshold: threshold
                });

                res.json({ success: true });
            } catch (error) {
                console.error('Error updating starboard settings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/safety/:guildId/raid', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const isTrue = (value) => value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

                await raidProtectionManager.updateSettings(guildId, {
                    enabled: isTrue(req.body.enabled),
                    joinRateLimit: Math.max(2, Number(req.body.joinRateLimit) || 5),
                    timeWindow: Math.max(5, Number(req.body.timeWindow) || 10),
                    accountAgeRequired: Math.max(0, Number(req.body.accountAgeRequired) || 0),
                    verificationEnabled: isTrue(req.body.verificationEnabled),
                    verificationRole: req.body.verificationRole || null,
                    autoKickNewAccounts: isTrue(req.body.autoKickNewAccounts),
                    autoKickRaiders: isTrue(req.body.autoKickRaiders)
                });

                res.json({ success: true, settings: raidProtectionManager.getSettings(guildId) });
            } catch (error) {
                console.error('Error updating raid settings:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/safety/:guildId/lockdown', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const locked = req.body.locked === true || req.body.locked === 'true' || req.body.locked === 'on';
                await raidProtectionManager.setLockdown(guildId, locked);
                res.json({ success: true, locked });
            } catch (error) {
                console.error('Error toggling lockdown:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Bot health dashboard
        this.app.get('/dashboard/:guildId/health', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const memUsage = process.memoryUsage();
                const auditLogs = readJsonFile(DASHBOARD_AUDIT_FILE, [])
                    .filter(entry => !entry.guildId || entry.guildId === guildId)
                    .slice(-30)
                    .reverse();

                res.render('health', {
                    guild,
                    user: req.user,
                    health: {
                        status: this.client?.isReady?.() ? 'Online' : 'Starting',
                        uptime: Math.floor(process.uptime()),
                        ping: this.client?.ws?.ping ?? -1,
                        guilds: this.client?.guilds?.cache?.size ?? 0,
                        users: this.client?.users?.cache?.size ?? 0,
                        memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
                        rssMB: Math.round(memUsage.rss / 1024 / 1024),
                        cpuLoad: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000)
                    },
                    auditLogs
                });
            } catch (error) {
                console.error('Health page error:', error);
                res.status(500).send('Error loading health dashboard');
            }
        });

        // Command permission management
        this.app.post('/api/command-permissions/:guildId/:commandName', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId, commandName } = req.params;
                const available = collectDashboardCommands(this.client, guildId);
                const exists = available.some(cmd => cmd.name === commandName);

                if (!exists) {
                    return res.status(404).json({ success: false, error: 'Command not found' });
                }

                const enabled = !(req.body.enabled === false || req.body.enabled === 'false' || req.body.enabled === '0');
                const requiredRoleId = req.body.requiredRoleId || null;

                if (enabled) {
                    await commandPermissionsManager.enableCommand(guildId, commandName);
                } else {
                    await commandPermissionsManager.disableCommand(guildId, commandName);
                }

                await commandPermissionsManager.setCommandRole(guildId, commandName, requiredRoleId);
                res.json({ success: true, commandName, enabled, requiredRoleId });
            } catch (error) {
                console.error('Error updating command permissions:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== NEW DASHBOARD ROUTES ==========

        // Analytics Dashboard
        this.app.get('/dashboard/:guildId/analytics', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const analytics = await analyticsManager.getDashboardData(guildId);

                res.render('analytics', {
                    guild,
                    analytics,
                    user: req.user
                });
            } catch (error) {
                console.error('Analytics page error:', error);
                res.status(500).send('Error loading analytics');
            }
        });

        // Live Alerts Dashboard
        this.app.get('/dashboard/:guildId/live-alerts', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const alerts = liveAlertsManager.getAlerts(guildId);

                res.render('live-alerts', {
                    guild,
                    alerts,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone'),
                    envStatus: {
                        twitch: !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
                        youtube: !!process.env.YOUTUBE_API_KEY
                    },
                    user: req.user
                });
            } catch (error) {
                console.error('Live alerts page error:', error);
                res.status(500).send('Error loading live alerts');
            }
        });

        // Command Management
        this.app.get('/dashboard/:guildId/commands', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const commands = collectDashboardCommands(this.client, guildId);
                const customCommands = Object.entries(customCommandManager.getCommands(guildId) || {})
                    .map(([name, response]) => ({ name, response }));

                res.render('commands', {
                    guild,
                    commands,
                    customCommands,
                    roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone'),
                    user: req.user
                });
            } catch (error) {
                console.error('Commands page error:', error);
                res.status(500).send('Error loading commands dashboard');
            }
        });

        // Economy Leaderboard
        this.app.get('/dashboard/:guildId/economy', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                let leaderboard = economyManager.getLeaderboard(guildId, 'balance', 50);

                // Resolve usernames for leaderboard
                leaderboard = await Promise.all(leaderboard.map(async (user) => ({
                    ...user,
                    username: await resolveGuildUsername(guild, user.userId)
                })));

                res.render('economy', {
                    guildId,
                    guild,
                    leaderboard,
                    formatNumber,
                    user: req.user
                });
            } catch (error) {
                console.error('Economy page error:', error);
                res.status(500).send('Error loading economy');
            }
        });

        // Global Economy Leaderboard
        this.app.get('/global-leaderboard', this.checkAuth, async (req, res) => {
            try {
                let leaderboard = economyManager.getGlobalLeaderboard('balance', 100);

                // Resolve usernames for global leaderboard
                leaderboard = await Promise.all(leaderboard.map(async (user) => ({
                    ...user,
                    username: await resolveGlobalUsername(this.client, user.userId)
                })));

                res.render('global-leaderboard', {
                    leaderboard,
                    formatNumber,
                    user: req.user
                });
            } catch (error) {
                console.error('Global leaderboard error:', error);
                res.status(500).send('Error loading global leaderboard');
            }
        });

        // API: Get Analytics Data
        this.app.get('/api/:guildId/analytics', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const analytics = await analyticsManager.getDashboardData(guildId);
                res.json(analytics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // API: Get Leaderboard
        this.app.get('/api/:guildId/leaderboard', async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const limit = req.query.limit || 50;
                const guild = this.client.guilds.cache.get(guildId);
                let leaderboard = economyManager.getLeaderboard(guildId, 'balance', parseInt(limit));
                
                // Resolve usernames for leaderboard
                if (guild) {
                    leaderboard = await Promise.all(leaderboard.map(async (user) => ({
                        ...user,
                        username: await resolveGuildUsername(guild, user.userId)
                    })));
                }
                
                res.json(leaderboard);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    checkAuth(req, res, next) {
        if (req.isAuthenticated()) return next();
        res.redirect('/login');
    }

    isBotOwner(userId) {
        return Boolean(process.env.BOT_OWNER_ID) && userId === process.env.BOT_OWNER_ID;
    }

    checkOwnerAccess(req, res, next) {
        if (!process.env.BOT_OWNER_ID) {
            return res.status(403).send('BOT_OWNER_ID is not configured');
        }

        if (!this.isBotOwner(req.user?.id)) {
            return res.status(403).send('Only the bot owner can access this dashboard area');
        }

        next();
    }

    async checkGuildAccess(req, res, next) {
        try {
            const guildId = req.params.guildId;
            const guild = this.client.guilds.cache.get(guildId);

            if (!guild) {
                return res.status(403).send('Bot is not in this server');
            }

            const userGuild = req.user.guilds.find(g => g.id === guildId);
            if (!userGuild) {
                return res.status(403).send('You do not have access to this server');
            }

            const member = await withTimeout(guild.members.fetch(req.user.id).catch(() => null), 3000);
            if (!member) {
                return res.status(403).send('Unable to verify your current server permissions');
            }

            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                return res.status(403).send('You need Administrator permissions');
            }

            next();
        } catch (error) {
            console.error('Dashboard guild access check failed:', error);
            res.status(500).send('Failed to verify dashboard access');
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🌐 Dashboard running at http://localhost:${this.port}`);
        });
    }
}

module.exports = Dashboard;
