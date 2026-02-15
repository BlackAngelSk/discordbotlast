/**
 * Dashboard Routes - Enhancements for Server Management
 * Extends the existing dashboard with new pages
 */

const express = require('express');
const settingsManager = require('../utils/settingsManager');
const economyManager = require('../utils/economyManager');
const moderationManager = require('../utils/moderationManager');
const analyticsManager = require('../utils/analyticsManager');
const premiumManager = require('../utils/premiumManager');

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    next();
};

// Dashboard Home
router.get('/dashboard/:guildId', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const guild = req.user.guilds.find(g => g.id === guildId);

        if (!guild || !(guild.permissions & 0x0000000020)) {
            return res.status(403).send('Unauthorized');
        }

        const analytics = await analyticsManager.getDashboardData(guildId);
        const settings = await settingsManager.getGuildSettings(guildId);
        const isPremium = await premiumManager.getPremiumData(req.user.id);

        res.render('dashboard', {
            guild,
            analytics,
            settings,
            isPremium: isPremium && isPremium.isActive,
            user: req.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Server error');
    }
});

// Economy Settings
router.get('/dashboard/:guildId/economy', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const leaderboard = await economyManager.getLeaderboard(guildId, 50);
        const settings = await settingsManager.getGuildSettings(guildId);

        res.render('economy', {
            guildId,
            leaderboard,
            settings,
            user: req.user
        });
    } catch (error) {
        console.error('Economy page error:', error);
        res.status(500).send('Server error');
    }
});

// Moderation Logs
router.get('/dashboard/:guildId/moderation', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const guild = req.user.guilds.find(g => g.id === guildId);

        if (!guild || !(guild.permissions & 0x0000000008)) { // ADMINISTRATOR
            return res.status(403).send('Unauthorized');
        }

        const logs = await moderationManager.getModLogs(guildId, 100);

        res.render('moderation', {
            guildId,
            logs,
            user: req.user
        });
    } catch (error) {
        console.error('Moderation page error:', error);
        res.status(500).send('Server error');
    }
});

// Server Settings
router.get('/dashboard/:guildId/settings', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const guild = req.user.guilds.find(g => g.id === guildId);

        if (!guild || !(guild.permissions & 0x0000000020)) { // MANAGE_GUILD
            return res.status(403).send('Unauthorized');
        }

        const settings = await settingsManager.getGuildSettings(guildId);

        res.render('settings', {
            guildId,
            settings,
            user: req.user
        });
    } catch (error) {
        console.error('Settings page error:', error);
        res.status(500).send('Server error');
    }
});

// Update Settings
router.post('/dashboard/:guildId/settings', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const guild = req.user.guilds.find(g => g.id === guildId);

        if (!guild || !(guild.permissions & 0x0000000020)) {
            return res.status(403).send('Unauthorized');
        }

        const updates = req.body;
        await settingsManager.updateGuildSettings(guildId, updates);

        res.json({ success: true });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Analytics Page
router.get('/dashboard/:guildId/analytics', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const guild = req.user.guilds.find(g => g.id === guildId);

        if (!guild || !(guild.permissions & 0x0000000008)) {
            return res.status(403).send('Unauthorized');
        }

        const analytics = await analyticsManager.getDashboardData(guildId);

        res.render('analytics', {
            guildId,
            analytics,
            user: req.user
        });
    } catch (error) {
        console.error('Analytics page error:', error);
        res.status(500).send('Server error');
    }
});

// Premium Page
router.get('/premium', requireAuth, async (req, res) => {
    try {
        const premium = await premiumManager.getPremiumData(req.user.id);
        const tiers = premiumManager.getAllTiers();

        res.render('premium', {
            premium,
            tiers,
            user: req.user
        });
    } catch (error) {
        console.error('Premium page error:', error);
        res.status(500).send('Server error');
    }
});

// API: Get Analytics Data
router.get('/api/:guildId/analytics', requireAuth, async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const analytics = await analyticsManager.getDashboardData(guildId);
        res.json(analytics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get Leaderboard
router.get('/api/:guildId/leaderboard', async (req, res) => {
    try {
        const guildId = req.params.guildId;
        const limit = req.query.limit || 50;
        const leaderboard = await economyManager.getLeaderboard(guildId, parseInt(limit));
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
