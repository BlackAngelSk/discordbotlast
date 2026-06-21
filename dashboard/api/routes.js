/**
 * Public REST API Routes – v1
 *
 * All routes are mounted under /api/v1/ and require an API key.
 *
 * Endpoints:
 *   GET  /api/v1/health                  – health check (no auth)
 *   GET  /api/v1/docs                    – API documentation (no auth)
 *   GET  /api/v1/bot/stats               – global bot stats
 *   GET  /api/v1/bot/guilds              – list guilds (redacted info)
 *   GET  /api/v1/guilds/:guildId         – single guild info
 *   GET  /api/v1/guilds/:guildId/settings – server settings
 *   GET  /api/v1/guilds/:guildId/economy  – economy summary
 *   GET  /api/v1/guilds/:guildId/leaderboard – balance leaderboard
 *   GET  /api/v1/guilds/:guildId/moderation/warnings – warnings list
 *   GET  /api/v1/guilds/:guildId/commands – custom commands list
 *   GET  /api/v1/guilds/:guildId/suggestions – suggestions list
 *   GET  /api/v1/guilds/:guildId/pets/:userId – pet info
 *   GET  /api/v1/guilds/:guildId/afk/:userId – AFK check
 */

'use strict';

const { rateLimiter, authenticate, requireGuildAccess, asyncHandler, errorHandler } = require('./middleware');
const apiKeys = require('./apiKeys');
const errorLogManager = require('../../utils/errorLogManager');

/**
 * Register all public API v1 routes on the given Express app.
 * @param {import('express').Router|import('express').Express} app
 * @param {import('discord.js').Client} client
 */
function registerPublicApiRoutes(app, client) {
    // ── Apply default middleware to all /api/v1 routes ──────────────────────
    const router = require('express').Router();

    // Rate-limit all API requests (120 req/min default)
    router.use(rateLimiter({ windowMs: 60_000, maxRequests: 120 }));

    // ── Health (no auth) ───────────────────────────────────────────────────
    router.get('/health', (req, res) => {
        const botReady = client?.isReady?.() ?? false;
        res.json({
            status: botReady ? 'ok' : 'starting',
            uptime: Math.floor(process.uptime()),
            guilds: client?.guilds?.cache?.size ?? 0,
            timestamp: new Date().toISOString()
        });
    });

    // ── API Documentation (no auth) ────────────────────────────────────────
    router.get('/docs', (req, res) => {
        res.json({
            name: 'DiscordBotLast Public API',
            version: '1.0.0',
            authentication: {
                description: 'Pass your API key via Authorization header or query parameter.',
                header: 'Authorization: Bearer <api_key>',
                query: '?api_key=<api_key>'
            },
            rateLimit: {
                windowMs: 60000,
                maxRequests: 120,
                headers: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
            },
            endpoints: [
                {
                    method: 'GET',
                    path: '/api/v1/health',
                    auth: false,
                    description: 'Health check'
                },
                {
                    method: 'GET',
                    path: '/api/v1/docs',
                    auth: false,
                    description: 'This documentation'
                },
                {
                    method: 'GET',
                    path: '/api/v1/bot/stats',
                    auth: true,
                    scopes: ['read'],
                    description: 'Global bot statistics (guild count, user count, uptime)'
                },
                {
                    method: 'GET',
                    path: '/api/v1/bot/guilds',
                    auth: true,
                    scopes: ['read'],
                    description: 'List all guilds the bot is in (redacted)'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId',
                    auth: true,
                    scopes: ['read'],
                    description: 'Detailed info about a specific guild'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/settings',
                    auth: true,
                    scopes: ['read'],
                    description: 'Server settings for a guild'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/economy',
                    auth: true,
                    scopes: ['read'],
                    description: 'Economy summary for a guild'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/leaderboard',
                    auth: true,
                    scopes: ['read'],
                    description: 'Balance leaderboard for a guild',
                    query: ['limit (1-50, default 10)', 'type (balance|level, default balance)']
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/moderation/warnings',
                    auth: true,
                    scopes: ['read', 'moderation'],
                    description: 'List all warnings in a guild',
                    query: ['userId (optional filter)']
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/commands',
                    auth: true,
                    scopes: ['read'],
                    description: 'List custom commands for a guild'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/suggestions',
                    auth: true,
                    scopes: ['read'],
                    description: 'List suggestions for a guild',
                    query: ['status (optional filter: pending|approved|denied|implemented)']
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/pets/:userId',
                    auth: true,
                    scopes: ['read'],
                    description: 'Get pet info for a user'
                },
                {
                    method: 'GET',
                    path: '/api/v1/guilds/:guildId/afk/:userId',
                    auth: true,
                    scopes: ['read'],
                    description: 'Check if a user is AFK'
                }
            ]
        });
    });

    // ── Bot-level endpoints (auth required) ────────────────────────────────
    router.get('/bot/stats', authenticate, (req, res) => {
        const guilds = client?.guilds?.cache;
        const users = client?.users?.cache;
        const memUsage = process.memoryUsage();

        res.json({
            guilds: guilds?.size ?? 0,
            users: users?.size ?? 0,
            channels: client?.channels?.cache?.size ?? 0,
            uptime: Math.floor(process.uptime()),
            ping: client?.ws?.ping ?? -1,
            memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
            timestamp: new Date().toISOString()
        });
    });

    router.get('/bot/guilds', authenticate, (req, res) => {
        const guilds = (client?.guilds?.cache || []).map(g => ({
            id: g.id,
            name: g.name,
            memberCount: g.memberCount,
            icon: g.iconURL() || null,
            createdAt: g.createdAt?.toISOString() || null
        }));
        res.json({ guilds, total: guilds.length });
    });

    // ── Guild-level endpoints (auth + guild access) ────────────────────────
    router.get('/guilds/:guildId', authenticate, requireGuildAccess, asyncHandler(async (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const settingsManager = require('../../utils/settingsManager');
        const settings = settingsManager.get(guildId);

        res.json({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            icon: guild.iconURL() || null,
            ownerId: guild.ownerId,
            createdAt: guild.createdAt?.toISOString() || null,
            settings: {
                prefix: settings.prefixes?.[0] || settings.prefix || '!',
                language: settings.language || 'en',
                welcomeChannel: settings.welcomeChannel || null,
                leaveChannel: settings.leaveChannel || null,
                starboardChannel: settings.starboardChannel || null
            }
        });
    }));

    // Settings
    router.get('/guilds/:guildId/settings', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const settingsManager = require('../../utils/settingsManager');
        const settings = settingsManager.get(guildId);
        res.json({ guildId, settings });
    });

    // Economy summary
    router.get('/guilds/:guildId/economy', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const economyManager = require('../../utils/economyManager');
        const allData = economyManager.data || {};
        let totalBalance = 0;
        let totalUsers = 0;
        let totalXp = 0;

        for (const [key, userData] of Object.entries(allData)) {
            if (typeof userData === 'object' && userData !== null) {
                // Check if this user is in this guild
                const guilds = userData.guilds || [];
                if (guilds.includes(guildId) || key.includes(guildId)) {
                    totalBalance += Number(userData.balance) || 0;
                    totalXp += Number(userData.xp) || 0;
                    totalUsers++;
                }
            }
        }

        res.json({
            guildId,
            totalUsers,
            totalBalance,
            totalXp,
            averageBalance: totalUsers > 0 ? Math.round(totalBalance / totalUsers) : 0
        });
    });

    // Leaderboard
    router.get('/guilds/:guildId/leaderboard', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const economyManager = require('../../utils/economyManager');
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const type = req.query.type === 'level' ? 'level' : 'balance';

        const leaderboard = economyManager.getLeaderboard(guildId, type, limit);
        res.json({ guildId, type, leaderboard });
    });

    // Moderation warnings
    router.get('/guilds/:guildId/moderation/warnings', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const moderationManager = require('../../utils/moderationManager');
        const { userId } = req.query;

        let warnings = [];
        if (moderationManager.data?.warnings) {
            for (const [key, warns] of Object.entries(moderationManager.data.warnings)) {
                if (key.startsWith(guildId + '_')) {
                    const warnUserId = key.split('_')[1];
                    if (userId && warnUserId !== userId) continue;
                    for (const warn of warns) {
                        warnings.push({ ...warn, userId: warnUserId });
                    }
                }
            }
        }

        res.json({ guildId, warnings, total: warnings.length });
    });

    // Custom commands
    router.get('/guilds/:guildId/commands', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const customCommandManager = require('../../utils/customCommandManager');
        const commands = customCommandManager.getCommands(guildId);
        const commandList = Object.entries(commands).map(([name, data]) => ({
            name,
            response: typeof data.response === 'string'
                ? data.response.slice(0, 100) + (data.response.length > 100 ? '...' : '')
                : '[embed]',
            type: typeof data.response === 'string' ? 'text' : 'embed'
        }));

        res.json({ guildId, commands: commandList, total: commandList.length });
    });

    // Suggestions
    router.get('/guilds/:guildId/suggestions', authenticate, requireGuildAccess, (req, res) => {
        const { guildId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const suggestionManager = require('../../utils/suggestionManager');
        const allSuggestions = suggestionManager.getGuildSuggestions(guildId);
        const { status } = req.query;

        let suggestions = allSuggestions;
        if (status) {
            suggestions = suggestions.filter(s => s.status === status);
        }

        res.json({ guildId, suggestions, total: suggestions.length });
    });

    // Pet info
    router.get('/guilds/:guildId/pets/:userId', authenticate, requireGuildAccess, (req, res) => {
        const { guildId, userId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const petManager = require('../../utils/petManager');
        const pet = petManager.getPet(userId, guildId);

        if (!pet) {
            return res.json({ guildId, userId, pet: null });
        }

        res.json({ guildId, userId, pet });
    });

    // AFK check
    router.get('/guilds/:guildId/afk/:userId', authenticate, requireGuildAccess, (req, res) => {
        const { guildId, userId } = req.params;
        const guild = client?.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const afkManager = require('../../utils/afkManager');
        const afkData = afkManager.isAFK(userId, guildId);

        res.json({ guildId, userId, afk: afkData });
    });

    // ── Error Reporting endpoints (admin scope) ────────────────────────────
    router.get('/errors', authenticate, (req, res) => {
        const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
        const type = req.query.type || null;
        const search = req.query.search || null;

        const errors = errorLogManager.getRecentErrors({ days, limit, type, search });
        res.json({ errors, total: errors.length, days });
    });

    router.get('/errors/stats', authenticate, (req, res) => {
        const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
        const stats = errorLogManager.getErrorStats(days);
        res.json(stats);
    });

    router.get('/errors/storage', authenticate, (req, res) => {
        const info = errorLogManager.getStorageInfo();
        res.json(info);
    });

    // ── Mount router ───────────────────────────────────────────────────────
    app.use('/api/v1', router);

    // ── Error handler (must be last) ───────────────────────────────────────
    app.use('/api/v1', errorHandler);
}

module.exports = { registerPublicApiRoutes };