/**
 * Standalone helper functions for the dashboard server.
 *
 * Extracted from dashboard/server.js (Phase 4). These are module-level
 * utilities used by the Dashboard class (and each other) but they do not
 * depend on any Dashboard instance state.
 */
// @ts-check

'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const settingsManager = require('../utils/settingsManager');
const moderationManager = require('../utils/moderationManager');
const loggingManager = require('../utils/loggingManager');
const suggestionManager = require('../utils/suggestionManager');
const ticketManager = require('../utils/ticketManager');
const raidProtectionManager = require('../utils/raidProtectionManager');
const voiceRewardsManager = require('../utils/voiceRewardsManager');
const tempVoiceManager = require('../utils/tempVoiceManager');
const liveAlertsManager = require('../utils/liveAlertsManager');
const epicGamesAlertsManager = require('../utils/epicGamesAlertsManager');
const steamFreeGamesAlertsManager = require('../utils/steamFreeGamesAlertsManager');
const steamGameUpdatesManager = require('../utils/steamGameUpdatesManager');
const telegramSyncManager = require('../utils/telegramSyncManager');
const reactionRoleManager = require('../utils/reactionRoleManager');
const roleMenuManager = require('../utils/roleMenuManager');
const commandPermissionsManager = require('../utils/commandPermissionsManager');
const seasonManager = require('../utils/seasonManager');
const seasonLeaderboardManager = require('../utils/seasonLeaderboardManager');

const {
    findChannelByIdOrName,
    findRoleByIdOrName,
    normalizeTextInput,
    normalizeHexColorInput,
    normalizeEmbedPreviewColor,
    parseDashboardBoolean,
    applyPreviewTemplate
} = require('./helpers');

const seasonLeaderboardGames = /** @type {any} */ (seasonLeaderboardManager).SEASON_LEADERBOARD_GAMES
    ? /** @type {any} */ (seasonLeaderboardManager).SEASON_LEADERBOARD_GAMES
    : [];

/** @type {Record<string, string>} */
const DASHBOARD_SECTION_LABELS = {
    settings: 'Server Settings',
    economy: 'Economy',
    shop: 'Shop',
    commands: 'Commands',
    liveAlerts: 'Live Alerts',
    epicGamesAlerts: 'Epic Games Alerts',
    steamFreeGamesAlerts: 'Steam Free Games',
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

/**
 * @param {string} sectionKey
 * @returns {string}
 */
const getDashboardSectionLabel = (sectionKey) => DASHBOARD_SECTION_LABELS[sectionKey] || sectionKey;

/**
 * Infer which dashboard section a request path belongs to.
 * @param {string} requestPath
 * @returns {string | null}
 */
const inferDashboardSectionKey = (requestPath) => {
    const pathValue = String(requestPath || '');

    if (/^\/dashboard\/[^/]+$/.test(pathValue) || /^\/dashboard\/[^/]+\/server-builder$/.test(pathValue) || /^\/api\/settings\/[^/]+/.test(pathValue) || /^\/api\/server-profile\/[^/]+/.test(pathValue) || /^\/api\/server-resources\/[^/]+/.test(pathValue)) return 'settings';
    if (/^\/dashboard\/[^/]+\/economy$/.test(pathValue) || /^\/api\/economy\/[^/]+/.test(pathValue) || /^\/api\/[^/]+\/leaderboard$/.test(pathValue)) return 'economy';
    if (/^\/dashboard\/[^/]+\/shop$/.test(pathValue)) return 'shop';
    if (/^\/dashboard\/[^/]+\/commands$/.test(pathValue) || /^\/api\/commands\/[^/]+/.test(pathValue) || /^\/api\/command-permissions\/[^/]+/.test(pathValue)) return 'commands';
    if (/^\/dashboard\/[^/]+\/live-alerts$/.test(pathValue) || /^\/api\/live-alerts\/[^/]+/.test(pathValue)) return 'liveAlerts';
    if (/^\/dashboard\/[^/]+\/epic-games$/.test(pathValue) || /^\/api\/epic-games\/[^/]+/.test(pathValue)) return 'epicGamesAlerts';
    if (/^\/dashboard\/[^/]+\/steam-free-games$/.test(pathValue) || /^\/api\/steam-free-games\/[^/]+/.test(pathValue)) return 'steamFreeGamesAlerts';
    if (/^\/dashboard\/[^/]+\/steam-promos$/.test(pathValue) || /^\/api\/steam-promos\/[^/]+/.test(pathValue)) return 'steamFreeGamesAlerts';
    if (/^\/dashboard\/[^/]+\/steam-updates$/.test(pathValue) || /^\/api\/steam-updates\/[^/]+/.test(pathValue)) return 'steamGameUpdates';
    if (/^\/dashboard\/[^/]+\/telegram-sync$/.test(pathValue) || /^\/api\/telegram-sync\/[^/]+/.test(pathValue)) return 'telegramSync';
    if (/^\/dashboard\/[^/]+\/community$/.test(pathValue) || /^\/api\/community\/[^/]+/.test(pathValue)) return 'community';
    if (/^\/dashboard\/[^/]+\/voice-tools$/.test(pathValue) || /^\/api\/voice-tools\/[^/]+/.test(pathValue)) return 'voiceTools';
    if (/^\/dashboard\/[^/]+\/moderation$/.test(pathValue) || /^\/api\/[^/]+\/moderation(?:\/|$)/.test(pathValue)) return 'moderation';
    if (/^\/dashboard\/[^/]+\/automod$/.test(pathValue) || /^\/api\/[^/]+\/automod(?:\/|$)/.test(pathValue)) return 'automod';
    if (/^\/dashboard\/[^/]+\/safety$/.test(pathValue) || /^\/api\/safety\/[^/]+/.test(pathValue)) return 'safety';
    if (/^\/dashboard\/[^/]+\/analytics$/.test(pathValue) || /^\/api\/[^/]+\/analytics$/.test(pathValue)) return 'analytics';
    if (/^\/dashboard\/[^/]+\/activity$/.test(pathValue) || /^\/api\/[^/]+\/activity(?:\/|$)/.test(pathValue) || /^\/api\/[^/]+\/audit-log$/.test(pathValue)) return 'activity';

    return null;
};

/**
 * Read the most recent error-log entries from the logs directory.
 * @param {number} [limit]
 * @returns {Array<Record<string, any>>}
 */
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

        /** @type {Array<Record<string, any>>} */
        const entries = [];
        for (const fileName of files) {
            // One corrupt/unreadable log file must not hide every other entry.
            try {
                const content = JSON.parse(fs.readFileSync(path.join(logsDirectory, fileName), 'utf8'));
                if (Array.isArray(content)) {
                    entries.push(...content);
                }
            } catch (/** @type {any} */ fileError) {
                console.error(`Failed to read error log ${fileName}:`, fileError.message);
            }
        }

        return entries
            .sort((/** @type {any} */ left, /** @type {any} */ right) => Number(new Date(right.timestamp)) - Number(new Date(left.timestamp)))
            .slice(0, limit);
    } catch (error) {
        console.error('Failed to read recent error entries:', error);
        return [];
    }
};

/**
 * @param {string} guildId
 * @param {import('discord.js').Client} client
 * @returns {Promise<Record<string, any>>}
 */
const buildServerBackupPayload = async (guildId, client) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        throw new Error('Guild not found');
    }

    const settings = settingsManager.get(guildId);
    const modSettings = moderationManager.getAutomodSettings(guildId);
    const modLogChannel = moderationManager.getModLogChannel(guildId);
    const loggingChannel = await loggingManager.getLoggingChannel(guildId);
    const suggestionSettings = suggestionManager.getSettings(guildId);
    const ticketSettings = ticketManager.getSettings(guildId);
    const raidSettings = raidProtectionManager.getSettings(guildId);
    const voiceSettings = voiceRewardsManager.getSettings(guildId);
    const tempVoiceHubChannelId = tempVoiceManager.getHub(guildId);
    const liveAlerts = liveAlertsManager.getAlerts(guildId);
    const epicGamesConfig = epicGamesAlertsManager.getGuildConfig(guildId);
    const steamFreeGamesConfig = steamFreeGamesAlertsManager.getGuildConfig(guildId);
    const steamConfig = steamGameUpdatesManager.getGuildConfig(guildId);
    const telegramConfig = telegramSyncManager.getGuildConfig(guildId);

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        guild: {
            id: guild.id,
            name: guild.name
        },
        settings: {
            ...settings
        },
        moderation: {
            automod: { ...modSettings },
            modLogChannel: /** @type {any} */ (modLogChannel),
            warnings: (/** @type {any} */ (moderationManager.data?.warnings || {}))[guildId] || null
        },
        logging: {
            channelId: loggingChannel || null
        },
        community: {
            suggestions: { ...suggestionSettings },
            reactionRoles: Object.entries(reactionRoleManager.data || {})
                .filter(([key]) => key.startsWith(`${guildId}_`))
                .reduce((/** @type {Record<string, any>} */ result, [key, value]) => {
                    result[key] = value;
                    return result;
                }, /** @type {Record<string, any>} */ ({})),
            roleMenus: roleMenuManager.getMenus(guildId)
        },
        tickets: {
            settings: { ...ticketSettings }
        },
        safety: {
            raidProtection: { ...raidSettings },
            starboard: settings.starboardChannel ? {
                channelId: settings.starboardChannel,
                threshold: settings.starboardThreshold || 3
            } : null
        },
        voice: {
            tempVoiceHubChannelId,
            rewards: { ...voiceSettings }
        },
        alerts: {
            liveAlerts,
            epicGames: epicGamesConfig,
            steamFreeGames: steamFreeGamesConfig,
            steam: steamConfig,
            telegram: telegramConfig
        }
    };
};

/**
 * @param {string} guildId
 * @param {import('discord.js').Client} client
 * @param {Record<string, any>} [payload]
 * @returns {Promise<{ applied: string[] }>}
 */
const restoreServerBackupPayload = async (guildId, client, payload = {}) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        throw new Error('Guild not found');
    }

    const applied = [];
    const backupSettings = payload.settings || {};

    const restoredSettings = {
        ...settingsManager.get(guildId),
        ...backupSettings
    };

    if (backupSettings.welcomeChannel) {
        const channel = findChannelByIdOrName(guild, backupSettings.welcomeChannel);
        if (channel) restoredSettings.welcomeChannel = channel.id;
    }
    if (backupSettings.leaveChannel) {
        const channel = findChannelByIdOrName(guild, backupSettings.leaveChannel);
        if (channel) restoredSettings.leaveChannel = channel.id;
    }
    if (backupSettings.starboardChannel) {
        const channel = findChannelByIdOrName(guild, backupSettings.starboardChannel);
        if (channel) restoredSettings.starboardChannel = channel.id;
    }

    await settingsManager.setMultiple(guildId, restoredSettings);
    applied.push('Core settings');

    if (payload.moderation?.automod) {
        await moderationManager.updateAutomodSettings(guildId, payload.moderation.automod);
        applied.push('Auto-moderation');
    }
    if (payload.moderation?.modLogChannel) {
        const channel = findChannelByIdOrName(guild, payload.moderation.modLogChannel);
        if (channel) {
            moderationManager.setModLogChannel(guildId, channel.id);
            applied.push('Moderation log channel');
        }
    }

    if (payload.logging?.channelId) {
        const channel = findChannelByIdOrName(guild, payload.logging.channelId);
        if (channel) {
            await loggingManager.setLoggingChannel(guildId, channel.id);
            applied.push('Logging channel');
        }
    }

    if (payload.community?.suggestions) {
        const suggestionSettings = { ...payload.community.suggestions };
        if (suggestionSettings.channelId) {
            const channel = findChannelByIdOrName(guild, suggestionSettings.channelId);
            if (channel) suggestionSettings.channelId = channel.id;
        }
        await suggestionManager.updateSettings(guildId, suggestionSettings);
        applied.push('Suggestion center');
    }

    if (payload.tickets?.settings) {
        const ticketSettings = { ...payload.tickets.settings };
        if (ticketSettings.categoryId) {
            const category = findChannelByIdOrName(guild, ticketSettings.categoryId);
            if (category && category.type === ChannelType.GuildCategory) ticketSettings.categoryId = category.id;
        }
        if (ticketSettings.logsChannelId) {
            const channel = findChannelByIdOrName(guild, ticketSettings.logsChannelId);
            if (channel) ticketSettings.logsChannelId = channel.id;
        }
        await ticketManager.setSettings(guildId, ticketSettings);
        applied.push('Tickets');
    }

    if (payload.safety?.raidProtection) {
        await raidProtectionManager.updateSettings(guildId, payload.safety.raidProtection);
        applied.push('Raid protection');
    }

    if (payload.voice?.rewards) {
        await voiceRewardsManager.updateSettings(guildId, payload.voice.rewards);
        applied.push('Voice rewards');
    }
    if (payload.voice?.tempVoiceHubChannelId) {
        const channel = findChannelByIdOrName(guild, payload.voice.tempVoiceHubChannelId);
        if (channel) {
            await tempVoiceManager.setHub(guildId, channel.id);
            applied.push('Temporary voice hub');
        }
    }

    if (payload.alerts?.epicGames?.channelId) {
        const channel = findChannelByIdOrName(guild, payload.alerts.epicGames.channelId);
        if (channel) {
            await epicGamesAlertsManager.enableAlerts(guildId, channel.id);
            applied.push('Epic Games alerts');
        }
    }
    if (payload.alerts?.steamFreeGames?.channelId) {
        const channel = findChannelByIdOrName(guild, payload.alerts.steamFreeGames.channelId);
        if (channel) {
            await steamFreeGamesAlertsManager.enableAlerts(guildId, channel.id);
            applied.push('Steam free game alerts');
        }
    }
    if (payload.alerts?.steam?.channelId) {
        const channel = findChannelByIdOrName(guild, payload.alerts.steam.channelId);
        if (channel) {
            await steamGameUpdatesManager.updateGuildConfig(guildId, channel.id, payload.alerts.steam.rawGames || payload.alerts.steam.trackedGames || [], {
                enabled: payload.alerts.steam.enabled
            });
            applied.push('Steam updates');
        }
    }
    if (payload.alerts?.telegram) {
        const telegramConfig = { ...payload.alerts.telegram };
        if (telegramConfig.discordChannelId) {
            const channel = findChannelByIdOrName(guild, telegramConfig.discordChannelId);
            if (channel) telegramConfig.discordChannelId = channel.id;
        }
        await telegramSyncManager.updateGuildConfig(guildId, telegramConfig);
        applied.push('Telegram sync');
    }

    if (payload.alerts?.liveAlerts) {
        const incoming = payload.alerts.liveAlerts;
        /** @type {{ twitch: any[], youtube: any[] }} */
        const mapped = { twitch: [], youtube: [] };

        for (const entry of Array.isArray(incoming.twitch) ? incoming.twitch : []) {
            const channel = findChannelByIdOrName(guild, entry.channelId);
            if (!channel) continue;

            const role = entry.roleId ? findRoleByIdOrName(guild, entry.roleId) : null;
            mapped.twitch.push({
                username: String(entry.username || '').toLowerCase().trim(),
                channelId: channel.id,
                roleId: role?.id || null,
                lastLive: false
            });
        }

        for (const entry of Array.isArray(incoming.youtube) ? incoming.youtube : []) {
            const channel = findChannelByIdOrName(guild, entry.discordChannelId);
            if (!channel) continue;

            const role = entry.roleId ? findRoleByIdOrName(guild, entry.roleId) : null;
            mapped.youtube.push({
                channelId: String(entry.channelId || '').trim(),
                sourceIdentifier: String(entry.sourceIdentifier || entry.channelId || '').trim(),
                channelName: entry.channelName || null,
                discordChannelId: channel.id,
                roleId: role?.id || null,
                lastVideoId: entry.lastVideoId || null,
                channelUrl: entry.channelUrl || null
            });
        }

        if (mapped) {
            /** @type {any} */ (liveAlertsManager.data)[guildId] = mapped;
            await liveAlertsManager.save();
        }
        applied.push('Live alerts');
    }

    return { applied };
};

/**
 * @param {Record<string, any>} [body]
 * @param {Record<string, any>} [existingConfig]
 * @returns {Record<string, any>}
 */
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

/**
 * @param {import('discord.js').EmbedBuilder | Record<string, any> | null} embed
 * @returns {Record<string, any>}
 */
const serializeEmbedPreview = (embed) => {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : (embed || {});

    return {
        title: String(data.title || ''),
        description: String(data.description || ''),
        fields: Array.isArray(data.fields)
            ? data.fields.map((/** @type {any} */ field) => ({
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

/**
 * @param {Record<string, any>} [config]
 * @param {string} [seasonName]
 * @returns {import('discord.js').EmbedBuilder[]}
 */
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

    const leaderboardToDescription = (/** @type {any[]} */ players) => players
        .map((/** @type {any} */ player) => `${player.medal} **${player.username}** • **${player.value}**`)
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
    const firstGame = /** @type {any[]} */ (seasonLeaderboardGames).find((/** @type {any} */ game) => enabledGames.has(game.key));
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

/**
 * @param {string} guildId
 * @param {import('discord.js').Client} client
 * @param {Record<string, any> | null} [configOverride]
 * @returns {Promise<{ mode: string, currentSeasonName: string | null, embeds: any[] }>}
 */
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

/**
 * @param {any} client
 * @param {string} guildId
 * @returns {Array<Record<string, any>>}
 */
const collectDashboardCommands = (client, guildId) => {
    const merged = new Map();

    const upsert = (/** @type {string} */ name, /** @type {Record<string, any>} */ patch) => {
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

/**
 * @param {string} guildId
 * @param {number} page
 * @param {number} totalPages
 * @returns {import('discord.js').ActionRowBuilder}
 */
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

/**
 * @param {{ guild: any, guildId: string, client: import('discord.js').Client, seasonName: string }} args
 * @returns {Promise<{ updated: boolean, reason: string, messageId?: string, embedCount?: number, channelId?: string }>}
 */
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

    let leaderboardMessage = /** @type {any} */ (null);
    try {
        const message = await seasonLeaderboardManager.findLeaderboardMessage(channel, guildId, /** @type {string | null} */ (existingMessageId));
        if (!message) {
            throw new Error('Existing leaderboard message not found');
        }
        leaderboardMessage = await message.edit({ embeds: [embeds[0]], components: /** @type {any} */ (components) });
    } catch (error) {
        leaderboardMessage = await channel.send({ embeds: [embeds[0]], components: /** @type {any} */ (components) });
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
        reason: 'Leaderboard message synced',
        messageId: leaderboardMessage.id,
        embedCount: embeds.length,
        channelId: channel.id
    };
};

module.exports = {
    DASHBOARD_SECTION_LABELS,
    getDashboardSectionLabel,
    inferDashboardSectionKey,
    readRecentErrorEntries,
    buildServerBackupPayload,
    restoreServerBackupPayload,
    buildSeasonLeaderboardDashboardOptions,
    serializeEmbedPreview,
    buildSampleSeasonPreviewEmbeds,
    buildSeasonLeaderboardPreviewPayload,
    collectDashboardCommands,
    buildLeaderboardPageComponents,
    syncDashboardSeasonLeaderboardMessage,
};
