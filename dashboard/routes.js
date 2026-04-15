/**
 * Dashboard Routes - Enhanced Features
 */

const settingsManager = require('../utils/settingsManager');
const economyManager = require('../utils/economyManager');
const moderationManager = require('../utils/moderationManager');
const analyticsManager = require('../utils/analyticsManager');
const { formatNumber } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');

const AUDIT_LOG_FILE = path.join(__dirname, '..', 'data', 'dashboardAudit.json');
let auditWriteQueue = Promise.resolve();

function queueAuditWrite(entry) {
    auditWriteQueue = auditWriteQueue
        .then(async () => {
            let logs = [];

            try {
                const content = await fs.promises.readFile(AUDIT_LOG_FILE, 'utf8');
                logs = JSON.parse(content);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            logs.push(entry);
            if (logs.length > 500) logs = logs.slice(-500);
            await fs.promises.writeFile(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
        })
        .catch((err) => {
            console.error('Dashboard audit log error:', err.message);
        });
}

function auditLog(req, action, details = {}) {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            userId: req.user?.id || 'unknown',
            username: req.user?.username || 'unknown',
            guildId: req.params?.guildId || details.guildId || null,
            action,
            details,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
        };
        queueAuditWrite(entry);
    } catch (err) {
        console.error('Dashboard audit log error:', err.message);
    }
}

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
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount, icon: guild.icon },
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
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount, icon: guild.icon },
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
            leaderboard = await Promise.all(leaderboard.map(async (user) => ({
                ...user,
                username: await resolveGuildUsername(guild, user.userId)
            })));

            res.render('shop', {
                guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount, icon: guild.icon },
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
            auditLog(req, 'ADD_WARNING', { targetUserId: userId, reason });
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
            auditLog(req, 'REMOVE_WARNING', { warningId });
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
            auditLog(req, 'UPDATE_AUTOMOD', { settings });
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
            auditLog(req, 'ADD_BADWORD', { word });
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
            auditLog(req, 'REMOVE_BADWORD', { word });
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
            auditLog(req, 'ADD_SHOP_ITEM', { item });
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
            auditLog(req, 'REMOVE_SHOP_ITEM', { itemId });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete Shop Item (DELETE route for frontend compatibility)
    app.delete('/api/:guildId/shop/items/:itemId', checkAuth, checkGuildAccess, async (req, res) => {
        try {
            const { guildId, itemId } = req.params;
            
            if (!itemId) {
                return res.status(400).json({ success: false, error: 'Item ID is required' });
            }

            const removed = await economyManager.removeShopItem(guildId, itemId);
            if (!removed) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }
            auditLog(req, 'DELETE_SHOP_ITEM', { itemId });
            res.json({ success: true, message: 'Item deleted successfully' });
        } catch (error) {
            console.error('Error deleting shop item:', error);
            res.status(500).json({ success: false, error: error.message });
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
            auditLog(req, 'MANAGE_BALANCE', { targetUserId: userId, amount, action });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Dashboard Audit Log viewer (admin only)
    app.get('/api/:guildId/audit-log', checkAuth, checkGuildAccess, (req, res) => {
        try {
            const { guildId } = req.params;
            let logs = [];
            if (fs.existsSync(AUDIT_LOG_FILE)) {
                logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
            }
            const guildLogs = logs.filter(e => !e.guildId || e.guildId === guildId);
            res.json({ logs: guildLogs.slice(-100).reverse() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

};
