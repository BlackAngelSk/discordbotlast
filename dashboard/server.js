const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
require('dotenv').config();

const settingsManager = require('../utils/settingsManager');

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
        this.app.get('/dashboard/:guildId', this.checkAuth, this.checkGuildAccess, (req, res) => {
            const guild = this.client.guilds.cache.get(req.params.guildId);
            const settings = settingsManager.get(req.params.guildId);
            
            res.render('server', {
                user: req.user,
                guild: guild,
                settings: settings,
                roles: Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone'),
                channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0)
            });
        });

        // API: Update settings
        this.app.post('/api/settings/:guildId', this.checkAuth, this.checkGuildAccess, (req, res) => {
            try {
                const guildId = req.params.guildId;
                const updates = req.body;

                // Get current settings
                const settings = settingsManager.get(guildId);

                // Update allowed fields
                const allowedFields = [
                    'prefix', 'djRole', 'autoRole', 
                    'welcomeChannel', 'welcomeMessage', 'welcomeEnabled',
                    'leaveChannel', 'leaveMessage', 'leaveEnabled'
                ];

                allowedFields.forEach(field => {
                    if (updates[field] !== undefined) {
                        settings[field] = updates[field];
                    }
                });

                settingsManager.save();

                res.json({ success: true, settings });
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
