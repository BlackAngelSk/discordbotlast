/**
 * Dashboard Routes - Enhanced Features
 */

const settingsManager = require('../utils/settingsManager');
const economyManager = require('../utils/economyManager');
const moderationManager = require('../utils/moderationManager');
const analyticsManager = require('../utils/analyticsManager');
const { formatNumber } = require('../utils/helpers');

module.exports = function(app, client, checkAuth, checkGuildAccess) {

    // Moderation Panel
    app.get('/dashboard/:guildId/moderation', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).send('Guild not found');
            }

            // Get all warnings for the guild
            const warnings = [];
            if (moderationManager.data && moderationManager.data.warnings) {
                Object.keys(moderationManager.data.warnings).forEach(key => {
                    if (key.startsWith(guildId + '_')) {
                        const userId = key.split('_')[1];
                        moderationManager.data.warnings[key].forEach(warn => {
                            warnings.push({ ...warn, userId });
                        });
                    }
                });
            }

            res.render('moderation', {
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
                warnings,
                bans: [],
                kicks: [],
                timeouts: [],
                user: req.user
            });
        } catch (error) {
            console.error('Moderation page error:', error);
            res.status(500).send('Server error');
        }
    });

    // Auto-Mod Settings
    app.get('/dashboard/:guildId/automod', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).send('Guild not found');
            }

            const modSettings = moderationManager.getAutomodSettings(guildId);

            res.render('automod', {
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
                settings: modSettings,
                user: req.user
            });
        } catch (error) {
            console.error('Auto-mod page error:', error);
            res.status(500).send('Server error');
        }
    });

    // Shop Manager
    app.get('/dashboard/:guildId/shop', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).send('Guild not found');
            }

            const shopItems = economyManager.getShopItems(guildId);
            let leaderboard = economyManager.getLeaderboard(guildId, 10);

            // Resolve usernames for leaderboard
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

            res.render('shop', {
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
                shopItems: shopItems || [],
                leaderboard: leaderboard || [],
                formatNumber,
                user: req.user
            });
        } catch (error) {
            console.error('Shop page error:', error);
            res.status(500).send('Server error');
        }
    });

    // === API ENDPOINTS ===

    // Add Warning
    app.post('/api/:guildId/moderation/warnings', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { userId, reason, moderatorId } = req.body;
            
            moderationManager.addWarning(guildId, userId, reason, moderatorId);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove Warning
    app.post('/api/:guildId/moderation/warnings/remove', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { warningId } = req.body;
            
            moderationManager.removeWarning(guildId, warningId);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Update Auto-Mod Settings
    app.post('/api/:guildId/automod/settings', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const settings = req.body;
            
            moderationManager.updateAutoModSettings(guildId, settings);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add Bad Word
    app.post('/api/:guildId/automod/badwords', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { word } = req.body;
            
            moderationManager.addBadWord(guildId, word);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove Bad Word
    app.post('/api/:guildId/automod/badwords/remove', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { word } = req.body;
            
            moderationManager.removeBadWord(guildId, word);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add Shop Item
    app.post('/api/:guildId/shop/items', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const item = req.body;
            
            economyManager.addShopItem(guildId, item);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Remove Shop Item
    app.post('/api/:guildId/shop/items/remove', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { itemId } = req.body;
            
            economyManager.removeShopItem(guildId, itemId);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Manage Balance
    app.post('/api/:guildId/shop/balance', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId } = req.params;
            const { userId, amount, action } = req.body;
            
            if (action === 'add') {
                economyManager.addBalance(guildId, userId, amount);
            } else if (action === 'remove') {
                economyManager.removeBalance(guildId, userId, amount);
            } else if (action === 'set') {
                economyManager.setBalance(guildId, userId, amount);
            }
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

};
