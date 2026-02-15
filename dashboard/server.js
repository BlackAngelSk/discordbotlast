const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
require('dotenv').config();

const settingsManager = require('../utils/settingsManager');
const moderationManager = require('../utils/moderationManager');
const loggingManager = require('../utils/loggingManager');
const inviteManager = require('../utils/inviteManager');
const economyManager = require('../utils/economyManager');
const customCommandManager = require('../utils/customCommandManager');
const statsManager = require('../utils/statsManager');
const ticketManager = require('../utils/ticketManager');

class Dashboard {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.port = process.env.DASHBOARD_PORT || 3000;
        
        // Bind middleware methods to preserve 'this' context
        this.checkAuth = this.checkAuth.bind(this);
        this.checkGuildAccess = this.checkGuildAccess.bind(this);
        
        this.setupMiddleware();
        this.setupAuth();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));

        this.app.use(session({
            secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
            resave: false,
            saveUninitialized: false,
            cookie: { maxAge: 60000 * 60 * 24 } // 24 hours
        }));

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
            const guilds = req.user.guilds.filter(guild => {
                return this.client.guilds.cache.has(guild.id);
            });

            res.render('dashboard', {
                user: req.user,
                guilds: guilds
            });
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
                
                res.render('server', {
                    user: req.user,
                    guild: guild,
                    settings: settings,
                    modSettings: modSettings,
                    modLogChannel: modLogChannel,
                    loggingChannel: loggingChannel,
                    topInviters: topInviters,
                    serverStats: serverStats,
                    economyLeaderboard: economyLeaderboard,
                    customCommands: customCommands,
                    activeTickets: activeTickets,
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

                // Get current settings
                const settings = settingsManager.get(guildId);

                // Update allowed fields
                const allowedFields = [
                    'djRole', 'autoRole', 
                    'welcomeChannel', 'welcomeMessage', 'welcomeEnabled',
                    'leaveChannel', 'leaveMessage', 'leaveEnabled'
                ];

                allowedFields.forEach(field => {
                    if (updates[field] !== undefined) {
                        settings[field] = updates[field];
                    }
                });

                // Handle prefixes (array)
                if (updates.prefixes !== undefined && Array.isArray(updates.prefixes)) {
                    await settingsManager.setPrefixes(guildId, updates.prefixes);
                }

                await settingsManager.save();

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
                if (updates.maxMentions !== undefined && Number.isFinite(updates.maxMentions)) autoModUpdates.maxMentions = updates.maxMentions;
                if (updates.maxEmojis !== undefined && Number.isFinite(updates.maxEmojis)) autoModUpdates.maxEmojis = updates.maxEmojis;
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
        this.app.post('/api/settings/:guildId/reset', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                settingsManager.reset(req.params.guildId);
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
        this.app.get('/api/economy/:guildId', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                const type = req.query.type || 'balance';
                const limit = parseInt(req.query.limit) || 10;
                const leaderboard = economyManager.getLeaderboard(req.params.guildId, type, limit);
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
    }

    checkAuth(req, res, next) {
        if (req.isAuthenticated()) return next();
        res.redirect('/login');
    }

    checkGuildAccess(req, res, next) {
        const guildId = req.params.guildId;
        
        // Check if bot is in the guild
        if (!this.client.guilds.cache.has(guildId)) {
            return res.status(403).send('Bot is not in this server');
        }

        // Check if user has access to this guild
        const userGuild = req.user.guilds.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).send('You do not have access to this server');
        }

        // Check if user has admin permissions
        const permissions = BigInt(userGuild.permissions);
        const ADMINISTRATOR = 0x0000000000000008n;
        
        if ((permissions & ADMINISTRATOR) !== ADMINISTRATOR) {
            return res.status(403).send('You need Administrator permissions');
        }

        next();
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🌐 Dashboard running at http://localhost:${this.port}`);
        });
    }
}

module.exports = Dashboard;
