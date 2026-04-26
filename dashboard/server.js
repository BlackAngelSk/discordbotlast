const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const databaseManager = require('../utils/databaseManager');
const { dashboardPermissionsManager, DASHBOARD_PERMISSION_SECTION_KEYS } = require('../utils/dashboardPermissionsManager');
const settingsManager = require('../utils/settingsManager');
const moderationManager = require('../utils/moderationManager');
const loggingManager = require('../utils/loggingManager');
const inviteManager = require('../utils/inviteManager');
const economyManager = require('../utils/economyManager');
const seasonManager = require('../utils/seasonManager');
const seasonLeaderboardManager = require('../utils/seasonLeaderboardManager');
const customCommandManager = require('../utils/customCommandManager');
const commandPermissionsManager = require('../utils/commandPermissionsManager');
const statsManager = require('../utils/statsManager');
const ticketManager = require('../utils/ticketManager');
const analyticsManager = require('../utils/analyticsManager');
const liveAlertsManager = require('../utils/liveAlertsManager');
const epicGamesAlertsManager = require('../utils/epicGamesAlertsManager');
const steamGameUpdatesManager = require('../utils/steamGameUpdatesManager');
const telegramSyncManager = require('../utils/telegramSyncManager');
const suggestionManager = require('../utils/suggestionManager');
const reactionRoleManager = require('../utils/reactionRoleManager');
const roleMenuManager = require('../utils/roleMenuManager');
const tempVoiceManager = require('../utils/tempVoiceManager');
const voiceRewardsManager = require('../utils/voiceRewardsManager');
const raidProtectionManager = require('../utils/raidProtectionManager');
const starboardManager = require('../utils/starboardManager');
const { formatNumber } = require('../utils/helpers');
const dashboardRoutes = require('./routes');
const seasonLeaderboardGames = Array.isArray(seasonLeaderboardManager.SEASON_LEADERBOARD_GAMES)
    ? seasonLeaderboardManager.SEASON_LEADERBOARD_GAMES
    : [];

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

const DASHBOARD_SECTION_LABELS = {
    settings: 'Server Settings',
    economy: 'Economy',
    shop: 'Shop',
    commands: 'Commands',
    liveAlerts: 'Live Alerts',
    epicGamesAlerts: 'Epic Games Alerts',
    steamGameUpdates: 'Steam Updates',
    telegramSync: 'Telegram Sync',
    community: 'Community',
    voiceTools: 'Voice Tools',
    moderation: 'Moderation',
    automod: 'Auto-Mod',
    safety: 'Safety Center',
    analytics: 'Analytics',
    activity: 'Activity Center',
    health: 'Bot Health'
};

const getDashboardSectionLabel = (sectionKey) => DASHBOARD_SECTION_LABELS[sectionKey] || sectionKey;

const inferDashboardSectionKey = (requestPath) => {
    const pathValue = String(requestPath || '');

    if (/^\/dashboard\/[^/]+$/.test(pathValue) || /^\/api\/settings\/[^/]+/.test(pathValue)) return 'settings';
    if (/^\/dashboard\/[^/]+\/economy$/.test(pathValue) || /^\/api\/economy\/[^/]+/.test(pathValue) || /^\/api\/[^/]+\/leaderboard$/.test(pathValue)) return 'economy';
    if (/^\/dashboard\/[^/]+\/shop$/.test(pathValue)) return 'shop';
    if (/^\/dashboard\/[^/]+\/commands$/.test(pathValue) || /^\/api\/commands\/[^/]+/.test(pathValue) || /^\/api\/command-permissions\/[^/]+/.test(pathValue)) return 'commands';
    if (/^\/dashboard\/[^/]+\/live-alerts$/.test(pathValue) || /^\/api\/live-alerts\/[^/]+/.test(pathValue)) return 'liveAlerts';
    if (/^\/dashboard\/[^/]+\/epic-games$/.test(pathValue) || /^\/api\/epic-games\/[^/]+/.test(pathValue)) return 'epicGamesAlerts';
    if (/^\/dashboard\/[^/]+\/steam-updates$/.test(pathValue) || /^\/api\/steam-updates\/[^/]+/.test(pathValue)) return 'steamGameUpdates';
    if (/^\/dashboard\/[^/]+\/telegram-sync$/.test(pathValue) || /^\/api\/telegram-sync\/[^/]+/.test(pathValue)) return 'telegramSync';
    if (/^\/dashboard\/[^/]+\/community$/.test(pathValue) || /^\/api\/community\/[^/]+/.test(pathValue)) return 'community';
    if (/^\/dashboard\/[^/]+\/voice-tools$/.test(pathValue) || /^\/api\/voice-tools\/[^/]+/.test(pathValue)) return 'voiceTools';
    if (/^\/dashboard\/[^/]+\/moderation$/.test(pathValue) || /^\/api\/[^/]+\/moderation(?:\/|$)/.test(pathValue)) return 'moderation';
    if (/^\/dashboard\/[^/]+\/automod$/.test(pathValue) || /^\/api\/[^/]+\/automod(?:\/|$)/.test(pathValue)) return 'automod';
    if (/^\/dashboard\/[^/]+\/safety$/.test(pathValue) || /^\/api\/safety\/[^/]+/.test(pathValue)) return 'safety';
    if (/^\/dashboard\/[^/]+\/analytics$/.test(pathValue) || /^\/api\/[^/]+\/analytics$/.test(pathValue)) return 'analytics';
    if (/^\/dashboard\/[^/]+\/activity$/.test(pathValue) || /^\/api\/[^/]+\/activity(?:\/|$)/.test(pathValue) || /^\/api\/[^/]+\/audit-log$/.test(pathValue)) return 'activity';
    if (/^\/dashboard\/[^/]+\/health$/.test(pathValue)) return 'health';

    return null;
};

const resolveStoredTextChannel = (guild, storedValue) => {
    const normalizedValue = String(storedValue || '').trim();
    if (!guild || !normalizedValue) return null;

    return guild.channels.cache.get(normalizedValue)
        || guild.channels.cache.find((channel) => channel.type === 0 && channel.name === normalizedValue)
        || null;
};

const replaceMemberTemplateTokens = (template, member, guild) => {
    return String(template || '')
        .replaceAll('{user}', member ? `<@${member.id}>` : 'Test User')
        .replaceAll('{server}', guild?.name || 'Server');
};

const readRecentErrorEntries = (limit = 20) => {
    try {
        const logsDirectory = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDirectory)) {
            return [];
        }

        const files = fs.readdirSync(logsDirectory)
            .filter((fileName) => fileName.startsWith('error-') && fileName.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, 5);

        const entries = [];
        for (const fileName of files) {
            const content = JSON.parse(fs.readFileSync(path.join(logsDirectory, fileName), 'utf8'));
            entries.push(...content);
        }

        return entries
            .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
            .slice(0, limit);
    } catch (error) {
        console.error('Failed to read recent error entries:', error);
        return [];
    }
};

const readDashboardAuditEntries = ({ guildId = null, limit = 50 } = {}) => {
    const entries = readJsonFile(DASHBOARD_AUDIT_FILE, []);
    return entries
        .filter((entry) => !guildId || !entry.guildId || entry.guildId === guildId)
        .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
        .slice(0, limit);
};

const normalizeEmbedPreviewColor = (colorValue) => {
    const parsed = Number(colorValue);
    const safeValue = Number.isFinite(parsed) ? parsed : 0x5865F2;
    return `#${safeValue.toString(16).padStart(6, '0')}`;
};

const normalizeHexColorInput = (value, fallback = '#5865F2') => {
    const normalized = String(value || '').trim();
    const candidate = normalized.startsWith('#') ? normalized.slice(1) : normalized;
    if (!candidate) return fallback;
    if (!/^[0-9A-Fa-f]{6}$/.test(candidate)) return fallback;
    return `#${candidate.toUpperCase()}`;
};

const normalizeTextInput = (value, fallback, maxLength = 256) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return String(fallback || '');
    return trimmed.slice(0, maxLength);
};

const parseDashboardBoolean = (value) => value === true || value === 'true' || value === 'on' || value === '1' || value === 1;

const applyPreviewTemplate = (template, context = {}) => String(template || '').replace(/\{(\w+)\}/g, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(context, token)) {
        return match;
    }
    return String(context[token] ?? '');
});

const buildSeasonLeaderboardDashboardOptions = (body = {}, existingConfig = {}) => {
    const defaultAppearance = typeof seasonLeaderboardManager.getDefaultAppearance === 'function'
        ? seasonLeaderboardManager.getDefaultAppearance()
        : {};
    const currentAppearance = {
        ...defaultAppearance,
        ...((existingConfig && existingConfig.appearance) || {})
    };
    const enabledGames = Array.isArray(body.enabledGames)
        ? body.enabledGames.map((gameKey) => String(gameKey || '').trim()).filter(Boolean)
        : [];

    return {
        hasChannelField: Object.prototype.hasOwnProperty.call(body, 'channelId'),
        channelId: String(body.channelId || '').trim() || null,
        configUpdate: {
            enabled: parseDashboardBoolean(body.enabled),
            updateIntervalMinutes: Number(body.updateIntervalMinutes),
            compactMode: parseDashboardBoolean(body.compactMode),
            allowedRoleId: String(body.allowedRoleId || '').trim() || null,
            pruneDays: Number(body.pruneDays),
            payouts: [body.payout1, body.payout2, body.payout3].map((value) => Number(value) || 0),
            rewardRoles: [body.rewardRole1, body.rewardRole2, body.rewardRole3]
                .map((roleId) => String(roleId || '').trim())
                .filter(Boolean)
                .slice(0, 3),
            appearance: {
                headerTitle: normalizeTextInput(body.headerTitle, currentAppearance.headerTitle, 256),
                headerDescription: normalizeTextInput(body.headerDescription, currentAppearance.headerDescription, 4096),
                headerColor: normalizeHexColorInput(body.headerColor, currentAppearance.headerColor),
                balanceTitle: normalizeTextInput(body.balanceTitle, currentAppearance.balanceTitle, 256),
                balanceColor: normalizeHexColorInput(body.balanceColor, currentAppearance.balanceColor),
                voiceTitle: normalizeTextInput(body.voiceTitle, currentAppearance.voiceTitle, 256),
                voiceColor: normalizeHexColorInput(body.voiceColor, currentAppearance.voiceColor),
                messagesTitle: normalizeTextInput(body.messagesTitle, currentAppearance.messagesTitle, 256),
                messagesColor: normalizeHexColorInput(body.messagesColor, currentAppearance.messagesColor),
                mediaTitle: normalizeTextInput(body.mediaTitle, currentAppearance.mediaTitle, 256),
                mediaColor: normalizeHexColorInput(body.mediaColor, currentAppearance.mediaColor),
                channelsTitle: normalizeTextInput(body.channelsTitle, currentAppearance.channelsTitle, 256),
                channelsColor: normalizeHexColorInput(body.channelsColor, currentAppearance.channelsColor),
                layoutDensity: ['standard', 'compact', 'minimal'].includes(String(body.layoutDensity || '').trim())
                    ? String(body.layoutDensity).trim()
                    : currentAppearance.layoutDensity,
                customBlockTitle: normalizeTextInput(body.customBlockTitle, currentAppearance.customBlockTitle, 256),
                customBlockBody: normalizeTextInput(body.customBlockBody, currentAppearance.customBlockBody, 1024),
                showBalance: parseDashboardBoolean(body.showBalance),
                showVoice: parseDashboardBoolean(body.showVoice),
                showMessages: parseDashboardBoolean(body.showMessages),
                showMedia: parseDashboardBoolean(body.showMedia),
                showChannels: parseDashboardBoolean(body.showChannels),
                showGambling: parseDashboardBoolean(body.showGambling),
                enabledGames
            }
        }
    };
};

const serializeEmbedPreview = (embed) => {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : (embed || {});

    return {
        title: String(data.title || ''),
        description: String(data.description || ''),
        fields: Array.isArray(data.fields)
            ? data.fields.map((field) => ({
                name: String(field?.name || ''),
                value: String(field?.value || ''),
                inline: Boolean(field?.inline)
            }))
            : [],
        footer: String(data.footer?.text || ''),
        color: normalizeEmbedPreviewColor(data.color),
        timestamp: data.timestamp || null
    };
};

const buildSampleSeasonPreviewEmbeds = (config = {}, seasonName = 'preview-season') => {
    const compactMode = Boolean(config.compactMode);
    const intervalMinutes = Number(config.updateIntervalMinutes) || 15;
    const layoutDensity = config.appearance?.layoutDensity || 'standard';
    const playerCount = compactMode || layoutDensity !== 'standard' ? 3 : 6;
    const appearance = config.appearance || {};
    const previewContext = {
        season: seasonName,
        players: 42,
        interval: intervalMinutes,
        started: new Date().toLocaleDateString(),
        status: 'Active'
    };
    const balancePlayers = [
        { medal: '🥇', username: 'Atlas', value: '145,230 coins' },
        { medal: '🥈', username: 'Nova', value: '128,940 coins' },
        { medal: '🥉', username: 'Echo', value: '117,580 coins' },
        { medal: '4.', username: 'Pixel', value: '98,410 coins' },
        { medal: '5.', username: 'Rune', value: '84,002 coins' },
        { medal: '6.', username: 'Astra', value: '73,115 coins' }
    ].slice(0, playerCount);
    const voicePlayers = [
        { medal: '🥇', username: 'Nova', value: '41h 20m' },
        { medal: '🥈', username: 'Atlas', value: '37h 45m' },
        { medal: '🥉', username: 'Echo', value: '33h 10m' },
        { medal: '4.', username: 'Pixel', value: '29h 05m' },
        { medal: '5.', username: 'Rune', value: '21h 44m' },
        { medal: '6.', username: 'Astra', value: '19h 18m' }
    ].slice(0, playerCount);

    const leaderboardToDescription = (players) => players
        .map((player) => `${player.medal} **${player.username}** • **${player.value}**`)
        .join('\n');

    const headerEmbed = new EmbedBuilder()
        .setColor(parseInt(String(appearance.headerColor || '#5865F2').replace('#', ''), 16))
        .setTitle(applyPreviewTemplate(appearance.headerTitle || '📊 {season} - Live Leaderboards', previewContext))
        .setDescription(applyPreviewTemplate(appearance.headerDescription || 'Updated every {interval} minutes • Total Players: {players}', previewContext))
        .addFields(
            { name: '🕐 Started', value: new Date().toLocaleDateString(), inline: true },
            { name: '📝 Status', value: '🟢 Active', inline: true },
            { name: '⏭️ Next Update', value: 'In preview', inline: true }
        )
        .setTimestamp();

    const embeds = [headerEmbed];

    const customBlockBody = applyPreviewTemplate(appearance.customBlockBody || '', previewContext).trim();
    if (customBlockBody) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.headerColor || '#5865F2').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.customBlockTitle || '📝 Server Note', previewContext))
                .setDescription(customBlockBody)
        );
    }

    if (appearance.showBalance !== false) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.balanceColor || '#57F287').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.balanceTitle || '💰 Season Balance Leaderboard', previewContext))
                .setDescription(leaderboardToDescription(balancePlayers))
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' })
        );
    }

    if (appearance.showVoice !== false) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.voiceColor || '#9C27B0').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.voiceTitle || '🎙️ Season Voice Channel Hours', previewContext))
                .setDescription(leaderboardToDescription(voicePlayers))
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' })
        );
    }

    const messagesSamplePlayers = [
        { medal: '🥇', username: 'Rune', value: '1,204 messages' },
        { medal: '🥈', username: 'Nova', value: '987 messages' },
        { medal: '🥉', username: 'Atlas', value: '832 messages' }
    ].slice(0, playerCount);
    const mediaSamplePlayers = [
        { medal: '🥇', username: 'Echo', value: '312 posts' },
        { medal: '🥈', username: 'Pixel', value: '245 posts' },
        { medal: '🥉', username: 'Astra', value: '178 posts' }
    ].slice(0, playerCount);
    const channelsSamplePlayers = [
        { medal: '🥇', username: 'Atlas', value: '14 channels' },
        { medal: '🥈', username: 'Nova', value: '11 channels' },
        { medal: '🥉', username: 'Rune', value: '9 channels' }
    ].slice(0, playerCount);

    if (appearance.showMessages !== false) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.messagesColor || '#4ECDC4').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.messagesTitle || '💬 Most Messages Sent', previewContext))
                .setDescription(leaderboardToDescription(messagesSamplePlayers))
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' })
        );
    }

    if (appearance.showMedia !== false) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.mediaColor || '#FF9F43').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.mediaTitle || '🖼️ Most Images/GIFs Posted', previewContext))
                .setDescription(leaderboardToDescription(mediaSamplePlayers))
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' })
        );
    }

    if (appearance.showChannels !== false) {
        embeds.push(
            new EmbedBuilder()
                .setColor(parseInt(String(appearance.channelsColor || '#8E7CFD').replace('#', ''), 16))
                .setTitle(applyPreviewTemplate(appearance.channelsTitle || '🧭 Most Active Channels (Variety)', previewContext))
                .setDescription(leaderboardToDescription(channelsSamplePlayers))
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' })
        );
    }

    const enabledGames = new Set(Array.isArray(appearance.enabledGames) ? appearance.enabledGames : []);
    const firstGame = seasonLeaderboardGames.find((game) => enabledGames.has(game.key));
    if (appearance.showGambling !== false && firstGame) {
        const compactLines = layoutDensity === 'standard'
            ? [
                '🥇 **Atlas** • **28** wins (73.7%)',
                '🥈 **Nova** • **25** wins (69.4%)',
                '🥉 **Echo** • **18** wins (60.0%)'
            ]
            : layoutDensity === 'compact'
                ? [
                    'Wins: **Atlas** (28)',
                    'Rate: **Nova** (69.4%)',
                    'Games: **Echo** (31)'
                ]
                : [
                    'Wins: **Atlas** (28)',
                    'Rate: **Nova** (69.4%)'
                ];

        embeds.push(
            new EmbedBuilder()
                .setColor(0xF39C12)
                .setTitle(layoutDensity === 'standard' ? `${firstGame.name} - Most Wins` : firstGame.name)
                .setDescription(compactLines.join('\n'))
                .setFooter({ text: layoutDensity === 'minimal' ? 'Minimal layout' : compactMode ? 'Top 3 Players' : 'Top 5 Players' })
        );
    }

    return embeds;
};

const buildSeasonLeaderboardPreviewPayload = async (guildId, client, configOverride = null) => {
    const currentSeasonName = seasonManager.getCurrentSeason(guildId);
    const previewConfig = configOverride
        ? seasonLeaderboardManager.buildConfigPreview(guildId, configOverride)
        : seasonLeaderboardManager.getGuildConfig(guildId);
    let previewMode = 'sample';
    let embeds = [];

    if (currentSeasonName && seasonManager.getSeason(guildId, currentSeasonName)) {
        embeds = await seasonLeaderboardManager.generateSeasonEmbeds(guildId, seasonManager, currentSeasonName, client, previewConfig);
        if (embeds.length > 0) {
            previewMode = 'live';
        }
    }

    if (embeds.length === 0) {
        embeds = buildSampleSeasonPreviewEmbeds(previewConfig, currentSeasonName || 'preview-season');
    }

    return {
        mode: previewMode,
        currentSeasonName,
        embeds: embeds.map(serializeEmbedPreview)
    };
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

const buildLeaderboardPageComponents = (guildId, page, totalPages) => {
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
};

const syncDashboardSeasonLeaderboardMessage = async ({ guild, guildId, client, seasonName }) => {
    if (!guild || !guildId || !seasonName) {
        return { updated: false, reason: 'missing-season-or-guild' };
    }

    const cfg = seasonLeaderboardManager.getGuildConfig(guildId);
    if (cfg.enabled === false) {
        return { updated: false, reason: 'leaderboard-disabled' };
    }

    const channelId = seasonLeaderboardManager.getLeaderboardChannel(guildId);
    if (!channelId) {
        return { updated: false, reason: 'no-channel-configured' };
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { updated: false, reason: 'invalid-channel' };
    }

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
    if (!botPermissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return { updated: false, reason: 'missing-channel-permissions', channelId: channel.id };
    }

    const embeds = await seasonLeaderboardManager.generateSeasonEmbeds(guildId, seasonManager, seasonName, client);
    if (!embeds.length) {
        return { updated: false, reason: 'no-embeds-generated' };
    }

    const components = embeds.length > 1
        ? [buildLeaderboardPageComponents(guildId, 0, embeds.length)]
        : [];
    const existingMessageId = seasonLeaderboardManager.getLeaderboardMessage(guildId);

    let leaderboardMessage;
    try {
        const message = await seasonLeaderboardManager.findLeaderboardMessage(channel, guildId, existingMessageId);
        if (!message) {
            throw new Error('Existing leaderboard message not found');
        }
        leaderboardMessage = await message.edit({ embeds: [embeds[0]], components });
    } catch (error) {
        leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
    }

    await seasonLeaderboardManager.setLeaderboardMessage(guildId, leaderboardMessage.id);
    await seasonLeaderboardManager.setLeaderboardMessages(guildId, []);
    await seasonLeaderboardManager.setIndexMessage(guildId, null);
    seasonLeaderboardManager.setPageCache(guildId, {
        embeds,
        messageId: leaderboardMessage.id,
        channelId: channel.id
    });

    return {
        updated: true,
        messageId: leaderboardMessage.id,
        embedCount: embeds.length,
        channelId: channel.id
    };
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
            const recentErrors = readRecentErrorEntries(12);
            const recentOwnerAudits = readDashboardAuditEntries({ limit: 20 });

            res.render('owner-settings', {
                user: req.user,
                syncStatus,
                updateState,
                recentErrors,
                recentOwnerAudits,
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

        this.app.post('/api/owner/test-notification', this.checkAuth, this.checkOwnerAccess, async (req, res) => {
            try {
                const recipientId = process.env.ERROR_DM_USER_ID || process.env.BOT_OWNER_ID;
                if (!recipientId) {
                    return res.status(400).json({ success: false, error: 'No owner notification recipient is configured.' });
                }

                const recipient = await this.client.users.fetch(recipientId).catch(() => null);
                if (!recipient) {
                    return res.status(404).json({ success: false, error: 'Owner notification recipient could not be fetched.' });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🧪 Dashboard Test Notification')
                    .setDescription('This is a test DM triggered from the dashboard owner page.')
                    .addFields(
                        { name: 'Triggered By', value: `${req.user?.username || 'Unknown'} (${req.user?.id || 'unknown'})`, inline: false },
                        { name: 'Bot', value: this.client.user?.tag || 'Unknown bot', inline: true },
                        { name: 'Storage', value: databaseManager.useDB, inline: true }
                    )
                    .setTimestamp();

                await recipient.send({ embeds: [embed] });
                logDashboardAudit(req, 'OWNER_TEST_NOTIFICATION', { recipientId });

                res.json({ success: true, message: `Test notification sent to ${recipient.username}.` });
            } catch (error) {
                console.error('Error sending owner test notification:', error);
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
                logDashboardAudit(req, 'UPDATE_SERVER_SETTINGS', {
                    updatedFields: Object.keys(settingsUpdates),
                    updatedAutoModFields: Object.keys(autoModUpdates),
                    loggingChannel: updates.loggingChannel !== undefined ? (updates.loggingChannel || null) : undefined,
                    modLogChannel: updates.modLogChannel !== undefined ? (updates.modLogChannel || null) : undefined
                });
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
                logDashboardAudit(req, 'RESET_SERVER_SETTINGS', {});
                const settings = settingsManager.get(req.params.guildId);
                res.json({ success: true, settings });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/settings/:guildId/test', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const type = String(req.body.type || '').trim();

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                const member = await withTimeout(guild.members.fetch(req.user.id).catch(() => null), 3000);
                if (!member) {
                    return res.status(404).json({ success: false, error: 'Could not resolve your guild member profile for the test.' });
                }

                if (type === 'welcome') {
                    const settings = settingsManager.get(guildId);
                    const channel = resolveStoredTextChannel(guild, settings.welcomeChannel);
                    if (!settings.welcomeEnabled || !channel) {
                        return res.status(400).json({ success: false, error: 'Welcome messages are not fully configured yet.' });
                    }

                    const message = replaceMemberTemplateTokens(settings.welcomeMessage, member, guild);
                    await channel.send(`🧪 Test welcome message\n${message}`);
                } else if (type === 'leave') {
                    const settings = settingsManager.get(guildId);
                    const channel = resolveStoredTextChannel(guild, settings.leaveChannel);
                    if (!settings.leaveEnabled || !channel) {
                        return res.status(400).json({ success: false, error: 'Leave messages are not fully configured yet.' });
                    }

                    const message = replaceMemberTemplateTokens(settings.leaveMessage, member, guild);
                    await channel.send(`🧪 Test leave message\n${message}`);
                } else if (type === 'logging') {
                    const loggingChannelId = await loggingManager.getLoggingChannel(guildId);
                    if (!loggingChannelId) {
                        return res.status(400).json({ success: false, error: 'No logging channel is configured.' });
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('🧪 Logging Channel Test')
                        .setDescription('This is a test log entry from the dashboard.')
                        .addFields(
                            { name: 'Triggered By', value: `${member.user.tag}`, inline: true },
                            { name: 'Server', value: guild.name, inline: true }
                        )
                        .setTimestamp();

                    await loggingManager.sendLog(guildId, embed, this.client);
                } else if (type === 'suggestions') {
                    const suggestionSettings = suggestionManager.getSettings(guildId);
                    const channel = suggestionSettings.channelId ? guild.channels.cache.get(suggestionSettings.channelId) : null;
                    if (!suggestionSettings.enabled || !channel || !channel.isTextBased()) {
                        return res.status(400).json({ success: false, error: 'Suggestions are not fully configured yet.' });
                    }

                    const staffMention = suggestionSettings.staffRoleId ? `<@&${suggestionSettings.staffRoleId}>` : 'No staff role configured';
                    await channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x57F287)
                                .setTitle('🧪 Suggestion System Test')
                                .setDescription('This is a dashboard test message for the suggestion channel.')
                                .addFields(
                                    { name: 'Voting Enabled', value: suggestionSettings.votingEnabled ? 'Yes' : 'No', inline: true },
                                    { name: 'Auto Thread', value: suggestionSettings.autoThread ? 'Yes' : 'No', inline: true },
                                    { name: 'Staff Role', value: staffMention, inline: false }
                                )
                                .setTimestamp()
                        ]
                    });
                } else {
                    return res.status(400).json({ success: false, error: 'Unknown test action.' });
                }

                logDashboardAudit(req, 'RUN_SERVER_TEST', { type });
                res.json({ success: true, message: `Sent ${type} test successfully.` });
            } catch (error) {
                console.error('Error running dashboard test action:', error);
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

        // API: Epic Games alerts
        this.app.get('/api/epic-games/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const config = epicGamesAlertsManager.getGuildConfig(guildId);
                const snapshot = await epicGamesAlertsManager.fetchSnapshot().catch(() => null);

                res.json({
                    success: true,
                    config: config ? {
                        ...config,
                        channelName: config.channelId ? (guild?.channels?.cache?.get(config.channelId)?.name || `Unknown (${config.channelId})`) : null
                    } : null,
                    currentOffers: snapshot?.currentOffers || []
                });
            } catch (error) {
                console.error('Error fetching Epic Games alerts:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/epic-games/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const { channelId } = req.body;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!channelId) {
                    return res.status(400).json({ success: false, error: 'Channel is required' });
                }

                const channel = guild.channels.cache.get(channelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const snapshot = await epicGamesAlertsManager.enableAlerts(guildId, channelId);
                res.json({
                    success: true,
                    message: 'Epic Games alert channel saved successfully',
                    config: epicGamesAlertsManager.getGuildConfig(guildId),
                    currentOffers: snapshot?.currentOffers || []
                });
            } catch (error) {
                console.error('Error saving Epic Games alert:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.delete('/api/epic-games/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                await epicGamesAlertsManager.disableAlerts(req.params.guildId);
                res.json({ success: true, message: 'Epic Games alert removed successfully' });
            } catch (error) {
                console.error('Error removing Epic Games alert:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/epic-games/:guildId/test', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const configured = epicGamesAlertsManager.getGuildConfig(guildId);
                const requestedChannelId = String(req.body?.channelId || '').trim();
                const targetChannelId = requestedChannelId || configured?.channelId;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!targetChannelId) {
                    return res.status(400).json({ success: false, error: 'Choose a channel first' });
                }

                const channel = guild.channels.cache.get(targetChannelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const snapshot = await epicGamesAlertsManager.fetchSnapshot();
                const payload = epicGamesAlertsManager.buildCurrentAlert(snapshot);
                if (!payload) {
                    return res.status(400).json({ success: false, error: 'Epic Games did not return any free game offers right now.' });
                }

                for (const messagePayload of payload.messages) {
                    await channel.send(messagePayload);
                }

                res.json({ success: true, message: `Sent a test Epic Games alert to #${channel.name}` });
            } catch (error) {
                console.error('Error sending Epic Games test alert:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/steam-updates/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const { config, trackedGames, previews } = await steamGameUpdatesManager.getDashboardData(guildId);

                res.json({
                    success: true,
                    config: config ? {
                        ...config,
                        channelName: config.channelId ? (guild?.channels?.cache?.get(config.channelId)?.name || `Unknown (${config.channelId})`) : null
                    } : null,
                    trackedGames,
                    previews
                });
            } catch (error) {
                console.error('Error fetching Steam updates:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/steam-updates/:guildId/search', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const query = String(req.query.query || '').trim();
                if (query.length < 2) {
                    return res.json({ success: true, results: [] });
                }

                const results = await steamGameUpdatesManager.searchStoreGames(query);
                res.json({ success: true, results });
            } catch (error) {
                console.error('Error searching Steam games:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/steam-updates/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const { channelId, games } = req.body;
                const enabled = req.body?.enabled === true || req.body?.enabled === 'true' || req.body?.enabled === 'on' || req.body?.enabled === 1 || req.body?.enabled === '1';

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (enabled && !channelId) {
                    return res.status(400).json({ success: false, error: 'Channel is required when alerts are enabled' });
                }

                if (channelId) {
                    const channel = guild.channels.cache.get(channelId);
                    if (!channel || channel.type !== 0) {
                        return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                    }
                }

                const result = await steamGameUpdatesManager.updateGuildConfig(guildId, channelId || null, games, { enabled });
                res.json({
                    success: true,
                    message: result.wasTrimmed
                        ? 'Game updates saved. Only the first 20 tracked sources were kept.'
                        : 'Game updates saved successfully',
                    config: result.config,
                    trackedGames: result.trackedGames,
                    previews: result.previews
                });
            } catch (error) {
                console.error('Error saving Steam updates:', error);
                const statusCode = /invalid game identifiers|invalid steam app ids or urls|add at least one steam app id|minecraft|osu|lol/i.test(error.message) ? 400 : 500;
                res.status(statusCode).json({ success: false, error: error.message });
            }
        });

        this.app.delete('/api/steam-updates/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                await steamGameUpdatesManager.disableAlerts(req.params.guildId);
                res.json({ success: true, message: 'Steam updates removed successfully' });
            } catch (error) {
                console.error('Error removing Steam updates:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/steam-updates/:guildId/test', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const configured = steamGameUpdatesManager.getGuildConfig(guildId);
                const requestedChannelId = String(req.body?.channelId || '').trim();
                const targetChannelId = requestedChannelId || configured?.channelId;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!targetChannelId) {
                    return res.status(400).json({ success: false, error: 'Choose a channel first' });
                }

                const channel = guild.channels.cache.get(targetChannelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const payloads = await steamGameUpdatesManager.buildTestAlerts(guildId);
                if (payloads.length === 0) {
                    return res.status(400).json({ success: false, error: 'Steam did not return any recent update posts for the tracked games.' });
                }

                for (const payload of payloads) {
                    await channel.send(payload);
                }

                res.json({ success: true, message: `Sent a test Steam update alert to #${channel.name}` });
            } catch (error) {
                console.error('Error sending Steam test alert:', error);
                const statusCode = /no steam games are configured/i.test(error.message) ? 400 : 500;
                res.status(statusCode).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/telegram-sync/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const config = telegramSyncManager.getGuildConfig(guildId);

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                res.json({
                    success: true,
                    config: {
                        ...config,
                        channelName: config.discordChannelId
                            ? (guild.channels.cache.get(config.discordChannelId)?.name || `Unknown (${config.discordChannelId})`)
                            : null
                    },
                    envStatus: {
                        hasToken: telegramSyncManager.hasBotToken()
                    }
                });
            } catch (error) {
                console.error('Error fetching Telegram sync config:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/telegram-sync/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                const discordChannelId = String(req.body?.discordChannelId || '').trim();
                if (discordChannelId) {
                    const channel = guild.channels.cache.get(discordChannelId);
                    if (!channel || channel.type !== 0) {
                        return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                    }
                }

                const config = await telegramSyncManager.updateGuildConfig(guildId, {
                    enabled: req.body?.enabled,
                    discordChannelId,
                    telegramChatId: req.body?.telegramChatId,
                    syncDiscordToTelegram: req.body?.syncDiscordToTelegram,
                    syncTelegramToDiscord: req.body?.syncTelegramToDiscord,
                    includeAttachments: req.body?.includeAttachments
                });

                res.json({ success: true, message: 'Telegram sync settings saved successfully', config });
            } catch (error) {
                console.error('Error saving Telegram sync config:', error);
                const statusCode = /required|numeric|chat id|channel/i.test(error.message) ? 400 : 500;
                res.status(statusCode).json({ success: false, error: error.message });
            }
        });

        this.app.delete('/api/telegram-sync/:guildId', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                await telegramSyncManager.disableGuild(req.params.guildId);
                res.json({ success: true, message: 'Telegram sync disabled successfully' });
            } catch (error) {
                console.error('Error disabling Telegram sync:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/telegram-sync/:guildId/test', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const config = telegramSyncManager.getGuildConfig(guildId);
                const requestedBy = req.user?.username || req.user?.global_name || req.user?.id || 'Dashboard User';

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!config.discordChannelId) {
                    return res.status(400).json({ success: false, error: 'Set a Discord channel first' });
                }

                const channel = guild.channels.cache.get(config.discordChannelId);
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'Please choose a valid text channel' });
                }

                const direction = String(req.body?.direction || 'discordToTelegram');
                if (direction === 'telegramToDiscord') {
                    await channel.send({ content: `📨 **Telegram -> Discord sync test**\nRequested by: ${requestedBy}` });
                    return res.json({ success: true, message: `Sent a test Telegram-style message to #${channel.name}` });
                }

                await telegramSyncManager.sendTestToTelegram(guildId, requestedBy);
                res.json({ success: true, message: 'Sent a test Discord -> Telegram message' });
            } catch (error) {
                console.error('Error sending Telegram sync test:', error);
                const statusCode = /missing|required|chat id|token/i.test(error.message) ? 400 : 500;
                res.status(statusCode).json({ success: false, error: error.message });
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

                logDashboardAudit(req, 'ADD_REACTION_ROLE', {
                    messageId: postedMessage.id,
                    channelId: channel.id,
                    emoji: trimmedEmoji,
                    roleId: trimmedRoleId
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

        this.app.put('/api/community/:guildId/reaction-roles', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = this.client.guilds.cache.get(guildId);
                const { messageId, originalEmoji, emoji, roleId, messageContent } = req.body;

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found' });
                }

                if (!messageId || !originalEmoji || !emoji || !roleId || !messageContent) {
                    return res.status(400).json({ success: false, error: 'Message ID, original emoji, emoji, role, and message are required.' });
                }

                const existingEntry = reactionRoleManager.getReactionRoleEntry(guildId, String(messageId).trim(), String(originalEmoji).trim());
                if (!existingEntry) {
                    return res.status(404).json({ success: false, error: 'Reaction role entry not found.' });
                }

                const role = guild.roles.cache.get(String(roleId).trim());
                if (!role || role.name === '@everyone') {
                    return res.status(400).json({ success: false, error: 'Please choose a valid role.' });
                }

                const channel = guild.channels.cache.get(existingEntry.channelId || '');
                if (!channel || channel.type !== 0) {
                    return res.status(400).json({ success: false, error: 'The original reaction role channel is no longer available.' });
                }

                const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
                if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.comparePositionTo(role) <= 0) {
                    return res.status(400).json({ success: false, error: 'Bot cannot manage the selected role because of role hierarchy or missing Manage Roles.' });
                }

                const targetMessage = await channel.messages.fetch(String(messageId).trim()).catch(() => null);
                if (!targetMessage) {
                    return res.status(404).json({ success: false, error: 'The original dashboard-posted message could not be fetched.' });
                }

                await targetMessage.edit({ content: String(messageContent).trim() });

                const nextEmoji = String(emoji).trim();
                const previousEmoji = String(originalEmoji).trim();
                if (nextEmoji !== previousEmoji) {
                    try {
                        const previousReaction = targetMessage.reactions.cache.find((reaction) => {
                            const rendered = reaction.emoji.toString();
                            const identifier = reaction.emoji.identifier ? decodeURIComponent(reaction.emoji.identifier) : null;
                            return rendered === previousEmoji || identifier === previousEmoji;
                        });

                        if (previousReaction) {
                            await previousReaction.users.remove(this.client.user.id).catch(() => null);
                        }
                    } catch {
                        // Ignore cleanup failures and continue to the new reaction.
                    }

                    try {
                        await targetMessage.react(nextEmoji);
                    } catch {
                        return res.status(400).json({ success: false, error: 'Bot could not add the updated emoji reaction.' });
                    }

                    await reactionRoleManager.removeReactionRole(guildId, String(messageId).trim(), previousEmoji);
                }

                await reactionRoleManager.addReactionRole(guildId, targetMessage.id, nextEmoji, role.id, {
                    channelId: channel.id,
                    messageContent: targetMessage.content.slice(0, 180),
                    messageUrl: targetMessage.url
                });

                logDashboardAudit(req, 'UPDATE_REACTION_ROLE', {
                    messageId: targetMessage.id,
                    previousEmoji,
                    emoji: nextEmoji,
                    roleId: role.id
                });

                res.json({ success: true, messageId: targetMessage.id, messageUrl: targetMessage.url });
            } catch (error) {
                console.error('Error updating reaction role:', error);
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
                logDashboardAudit(req, 'REMOVE_REACTION_ROLE', { messageId: String(messageId).trim(), emoji: String(emoji).trim() });
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

                logDashboardAudit(req, 'UPDATE_SUGGESTION_SETTINGS', {
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

                logDashboardAudit(req, 'UPDATE_SUGGESTION_STATUS', { suggestionId, status, reason: reason || null });

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

        this.app.get('/dashboard/:guildId/activity', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const dashboardAuditLogs = readDashboardAuditEntries({ guildId, limit: 80 });
                const serverAuditLogs = this.client.auditLog?.getAuditLogs({ guildId, limit: 40, days: 14 }) || [];
                const serverAuditStats = this.client.auditLog?.getStats({ guildId, days: 14 }) || { total: 0, byCategory: {}, bySeverity: {} };

                res.render('activity', {
                    guild,
                    user: req.user,
                    dashboardAuditLogs,
                    serverAuditLogs,
                    serverAuditStats
                });
            } catch (error) {
                console.error('Activity page error:', error);
                res.status(500).send('Error loading activity center');
            }
        });

        // Bot health dashboard
        this.app.get('/dashboard/:guildId/health', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const memUsage = process.memoryUsage();
                const auditLogs = readDashboardAuditEntries({ guildId, limit: 30 });

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

        this.app.get('/dashboard/:guildId/permissions', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const member = await withTimeout(guild.members.fetch(req.user.id).catch(() => null), 3000);

                if (!member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                    return res.status(403).send('You need Administrator permissions to manage dashboard delegation');
                }

                res.render('permissions', {
                    guild,
                    user: req.user,
                    sectionLabels: DASHBOARD_PERMISSION_SECTION_KEYS.map((sectionKey) => ({
                        key: sectionKey,
                        label: getDashboardSectionLabel(sectionKey)
                    })),
                    sectionConfig: dashboardPermissionsManager.getSectionConfig(guildId),
                    roles: Array.from(guild.roles.cache.values()).filter((role) => role.name !== '@everyone')
                });
            } catch (error) {
                console.error('Permissions page error:', error);
                res.status(500).send('Error loading dashboard permissions');
            }
        });

        this.app.post('/api/:guildId/dashboard-permissions', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = this.client.guilds.cache.get(guildId);
                const member = await withTimeout(guild.members.fetch(req.user.id).catch(() => null), 3000);

                if (!member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                    return res.status(403).json({ success: false, error: 'Administrator permissions are required to manage dashboard delegation.' });
                }

                const nextConfig = {};
                for (const sectionKey of DASHBOARD_PERMISSION_SECTION_KEYS) {
                    nextConfig[sectionKey] = Array.isArray(req.body[sectionKey]) ? req.body[sectionKey] : [];
                }

                const sectionConfig = await dashboardPermissionsManager.setSectionConfig(guildId, nextConfig);
                logDashboardAudit(req, 'UPDATE_DASHBOARD_DELEGATION', { sectionConfig });
                res.json({ success: true, sectionConfig });
            } catch (error) {
                console.error('Error saving dashboard delegation:', error);
                res.status(500).json({ success: false, error: error.message });
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
                const topMessageUsers = statsManager.getTopUsers(guildId, 10);
                const topMessageChannels = statsManager.getTopChannels(guildId, 8);

                const topMessageUsersResolved = await Promise.all(topMessageUsers.map(async (entry) => ({
                    ...entry,
                    username: await resolveGuildUsername(guild, entry.userId)
                })));

                const topMessageChannelsResolved = topMessageChannels.map((entry) => ({
                    ...entry,
                    channelName: guild?.channels?.cache?.get(entry.channelId)?.name || `Unknown (${entry.channelId})`
                }));

                res.render('analytics', {
                    guild,
                    analytics,
                    topMessageUsers: topMessageUsersResolved,
                    topMessageChannels: topMessageChannelsResolved,
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

        // Epic Games Alerts Dashboard
        this.app.get('/dashboard/:guildId/epic-games', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const config = epicGamesAlertsManager.getGuildConfig(guildId);
                const snapshot = await epicGamesAlertsManager.fetchSnapshot().catch(() => null);

                res.render('epic-games', {
                    guild,
                    config,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    currentOffers: snapshot?.currentOffers || [],
                    user: req.user
                });
            } catch (error) {
                console.error('Epic Games alerts page error:', error);
                res.status(500).send('Error loading Epic Games alerts');
            }
        });

        this.app.get('/dashboard/:guildId/steam-updates', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const { config, previews } = await steamGameUpdatesManager.getDashboardData(guildId);

                res.render('steam-updates', {
                    guild,
                    config,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    previews,
                    user: req.user
                });
            } catch (error) {
                console.error('Steam updates page error:', error);
                res.status(500).send('Error loading Steam updates');
            }
        });

        this.app.get('/dashboard/:guildId/telegram-sync', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                const config = telegramSyncManager.getGuildConfig(guildId);

                res.render('telegram-sync', {
                    guild,
                    config,
                    channels: Array.from(guild.channels.cache.values()).filter(c => c.type === 0),
                    envStatus: {
                        hasToken: telegramSyncManager.hasBotToken()
                    },
                    user: req.user
                });
            } catch (error) {
                console.error('Telegram sync page error:', error);
                res.status(500).send('Error loading Telegram sync settings');
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
                const seasonLeaderboardConfig = seasonLeaderboardManager.getGuildConfig(guildId);
                const currentSeasonName = seasonManager.getCurrentSeason(guildId);
                const currentSeason = currentSeasonName ? seasonManager.getSeason(guildId, currentSeasonName) : null;
                const seasonLeaderboardPreview = await buildSeasonLeaderboardPreviewPayload(guildId, this.client);
                const channels = guild.channels.cache
                    .filter((channel) => channel.type === 0)
                    .sort((left, right) => left.rawPosition - right.rawPosition)
                    .map((channel) => ({ id: channel.id, name: channel.name }));
                const roles = guild.roles.cache
                    .filter((role) => role.id !== guild.id)
                    .sort((left, right) => right.position - left.position)
                    .map((role) => ({ id: role.id, name: role.name }));

                // Resolve usernames for leaderboard
                leaderboard = await Promise.all(leaderboard.map(async (user) => ({
                    ...user,
                    username: await resolveGuildUsername(guild, user.userId)
                })));

                res.render('economy', {
                    guildId,
                    guild,
                    leaderboard,
                    channels,
                    roles,
                    seasonLeaderboardGames,
                    seasonLeaderboardConfig,
                    seasonLeaderboardPreview,
                    currentSeasonName,
                    currentSeason,
                    formatNumber,
                    user: req.user
                });
            } catch (error) {
                console.error('Economy page error:', error);
                res.status(500).send('Error loading economy');
            }
        });

        this.app.post('/api/economy/:guildId/season-leaderboard-config', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);

                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found.' });
                }

                const config = seasonLeaderboardManager.getGuildConfig(guildId);
                const { hasChannelField, channelId, configUpdate } = buildSeasonLeaderboardDashboardOptions(req.body || {}, config);
                const validGameKeys = new Set(seasonLeaderboardGames.map((game) => game.key));

                if (!Number.isFinite(configUpdate.updateIntervalMinutes) || configUpdate.updateIntervalMinutes < 5 || configUpdate.updateIntervalMinutes > 1440) {
                    return res.status(400).json({ success: false, error: 'Update interval must be between 5 and 1440 minutes.' });
                }

                if (!Number.isFinite(configUpdate.pruneDays) || configUpdate.pruneDays < 0 || configUpdate.pruneDays > 3650) {
                    return res.status(400).json({ success: false, error: 'Prune days must be between 0 and 3650.' });
                }

                if (configUpdate.payouts.some((value) => !Number.isFinite(value) || value < 0)) {
                    return res.status(400).json({ success: false, error: 'Payout values must be zero or greater.' });
                }

                if (hasChannelField && channelId) {
                    const channel = guild.channels.cache.get(channelId)
                        || await guild.channels.fetch(channelId).catch(() => null);
                    if (!channel || !channel.isTextBased()) {
                        return res.status(400).json({ success: false, error: 'Please choose a valid text channel for leaderboard updates.' });
                    }

                    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
                    const botPermissions = botMember ? channel.permissionsFor(botMember) : null;
                    if (!botPermissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                        return res.status(400).json({
                            success: false,
                            error: 'The bot needs View Channel, Send Messages, and Embed Links in the selected leaderboard channel.'
                        });
                    }
                }

                if (configUpdate.allowedRoleId && !guild.roles.cache.has(configUpdate.allowedRoleId)) {
                    return res.status(400).json({ success: false, error: 'The selected force update role was not found in this server.' });
                }

                if (configUpdate.rewardRoles.some((roleId) => !guild.roles.cache.has(roleId))) {
                    return res.status(400).json({ success: false, error: 'One or more reward roles were not found in this server.' });
                }

                if ((configUpdate.appearance.enabledGames || []).some((gameKey) => !validGameKeys.has(gameKey))) {
                    return res.status(400).json({ success: false, error: 'One or more selected gambling leaderboard sections are invalid.' });
                }

                if (hasChannelField && channelId !== (config.channelId || null)) {
                    await seasonLeaderboardManager.setLeaderboardChannel(guildId, channelId);
                }

                await seasonLeaderboardManager.setLeaderboardOptions(guildId, configUpdate);

                const updatedConfig = seasonLeaderboardManager.getGuildConfig(guildId);
                const preview = await buildSeasonLeaderboardPreviewPayload(guildId, this.client);
                const syncResult = preview.currentSeasonName
                    ? await syncDashboardSeasonLeaderboardMessage({
                        guild,
                        guildId,
                        client: this.client,
                        seasonName: preview.currentSeasonName
                    })
                    : { updated: false, reason: 'no-current-season' };

                if (syncResult.updated) {
                    updatedConfig.lastAutoUpdate = Date.now();
                    updatedConfig.nextAutoUpdateAt = updatedConfig.lastAutoUpdate + ((updatedConfig.updateIntervalMinutes || 15) * 60 * 1000);
                    await seasonLeaderboardManager.save();
                }

                logDashboardAudit(req, 'UPDATE_SEASON_LEADERBOARD_CONFIG', {
                    enabled: updatedConfig.enabled,
                    channelId: updatedConfig.channelId || null,
                    compactMode: updatedConfig.compactMode,
                    updateIntervalMinutes: updatedConfig.updateIntervalMinutes,
                    pruneDays: updatedConfig.pruneDays,
                    syncResult
                });

                res.json({
                    success: true,
                    config: updatedConfig,
                    preview,
                    syncResult,
                    currentSeasonName: preview.currentSeasonName,
                    seasonInfo: preview.currentSeasonName
                        ? seasonManager.getSeason(guildId, preview.currentSeasonName)
                        : null
                });
            } catch (error) {
                console.error('Error updating season leaderboard dashboard settings:', error);
                res.status(500).json({ success: false, error: error.message || 'Failed to update season leaderboard settings.' });
            }
        });

        this.app.post('/api/economy/:guildId/season-leaderboard-preview', this.checkAuth, this.checkGuildAccess, async (req, res) => {
            try {
                const guildId = req.params.guildId;
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) {
                    return res.status(404).json({ success: false, error: 'Guild not found.' });
                }

                const config = seasonLeaderboardManager.getGuildConfig(guildId);
                const { hasChannelField, channelId, configUpdate } = buildSeasonLeaderboardDashboardOptions(req.body || {}, config);
                const validGameKeys = new Set(seasonLeaderboardGames.map((game) => game.key));

                if (!Number.isFinite(configUpdate.updateIntervalMinutes) || configUpdate.updateIntervalMinutes < 5 || configUpdate.updateIntervalMinutes > 1440) {
                    return res.status(400).json({ success: false, error: 'Update interval must be between 5 and 1440 minutes.' });
                }

                if (!Number.isFinite(configUpdate.pruneDays) || configUpdate.pruneDays < 0 || configUpdate.pruneDays > 3650) {
                    return res.status(400).json({ success: false, error: 'Prune days must be between 0 and 3650.' });
                }

                if (configUpdate.payouts.some((value) => !Number.isFinite(value) || value < 0)) {
                    return res.status(400).json({ success: false, error: 'Payout values must be zero or greater.' });
                }

                if (hasChannelField && channelId) {
                    const channel = guild.channels.cache.get(channelId)
                        || await guild.channels.fetch(channelId).catch(() => null);
                    if (!channel || !channel.isTextBased()) {
                        return res.status(400).json({ success: false, error: 'Please choose a valid text channel for leaderboard updates.' });
                    }
                }

                if (configUpdate.allowedRoleId && !guild.roles.cache.has(configUpdate.allowedRoleId)) {
                    return res.status(400).json({ success: false, error: 'The selected force update role was not found in this server.' });
                }

                if (configUpdate.rewardRoles.some((roleId) => !guild.roles.cache.has(roleId))) {
                    return res.status(400).json({ success: false, error: 'One or more reward roles were not found in this server.' });
                }

                if ((configUpdate.appearance.enabledGames || []).some((gameKey) => !validGameKeys.has(gameKey))) {
                    return res.status(400).json({ success: false, error: 'One or more selected gambling leaderboard sections are invalid.' });
                }

                const previewConfig = {
                    ...configUpdate,
                    channelId: hasChannelField ? channelId : config.channelId || null
                };
                const preview = await buildSeasonLeaderboardPreviewPayload(guildId, this.client, previewConfig);

                res.json({ success: true, preview });
            } catch (error) {
                console.error('Error previewing season leaderboard dashboard settings:', error);
                res.status(500).json({ success: false, error: error.message || 'Failed to preview season leaderboard settings.' });
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

            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return next();
            }

            const sectionKey = inferDashboardSectionKey(req.path);
            if (!sectionKey) {
                return res.status(403).send('You need Administrator permissions');
            }

            if (!dashboardPermissionsManager.memberCanAccessSection(member, sectionKey)) {
                return res.status(403).send(`You need Administrator permissions or a delegated role for ${getDashboardSectionLabel(sectionKey)}`);
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
