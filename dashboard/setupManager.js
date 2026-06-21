/**
 * Dashboard Setup Manager
 * Handles setup checklists, context collection, and server profile normalization.
 */

const settingsManager = require('../utils/settingsManager');
const moderationManager = require('../utils/moderationManager');
const loggingManager = require('../utils/loggingManager');
const suggestionManager = require('../utils/suggestionManager');
const ticketManager = require('../utils/ticketManager');
const raidProtectionManager = require('../utils/raidProtectionManager');
const voiceRewardsManager = require('../utils/voiceRewardsManager');
const tempVoiceManager = require('../utils/tempVoiceManager');
const liveAlertsManager = require('../utils/liveAlertsManager');
const { normalizeTextInput, normalizeHexColorInput } = require('./helpers');

/**
 * Normalizes and validates a server profile from input data.
 */
const normalizeServerProfile = (profile = {}, guild = null) => {
    const inviteUrl = String(profile.inviteUrl || '').trim();
    const safeInviteUrl = /^https:\/\/(discord\.gg|discord\.com\/invite)\//i.test(inviteUrl) ? inviteUrl : '';

    return {
        enabled: Boolean(profile.enabled),
        title: normalizeTextInput(profile.title, guild?.name || 'Server', 80),
        summary: normalizeTextInput(profile.summary, guild?.description || 'Shared from the dashboard.', 180),
        description: normalizeTextInput(profile.description, '', 1200),
        inviteUrl: safeInviteUrl,
        accentColor: normalizeHexColorInput(profile.accentColor, '#5865F2'),
        showMemberCount: profile.showMemberCount !== false,
        showChannelCount: profile.showChannelCount !== false,
        showRoleCount: profile.showRoleCount !== false
    };
};

/**
 * Builds the setup checklist items for a guild.
 */
const buildSetupChecklist = ({ guildId, settings, modSettings, modLogChannel, loggingChannel, suggestionSettings, ticketSettings, raidSettings, voiceSettings, tempVoiceHubChannelId, liveAlertsCount }) => {
    return [
        {
            title: 'Welcome + Leave Messages',
            description: 'Enable onboarding and leave notifications with a channel.',
            done: Boolean((settings.welcomeEnabled && settings.welcomeChannel) || (settings.leaveEnabled && settings.leaveChannel)),
            href: `/dashboard/${guildId}`,
            icon: 'fa-hand-wave'
        },
        {
            title: 'Server Logging',
            description: 'Choose a logging channel to capture server events.',
            done: Boolean(loggingChannel),
            href: `/dashboard/${guildId}`,
            icon: 'fa-scroll'
        },
        {
            title: 'Auto-Moderation',
            description: 'Turn on auto-mod and set your moderation log channel.',
            done: Boolean(modSettings.enabled && modLogChannel),
            href: `/dashboard/${guildId}/automod`,
            icon: 'fa-robot'
        },
        {
            title: 'Suggestions',
            description: 'Enable suggestion center and select a suggestion channel.',
            done: Boolean(suggestionSettings.enabled && suggestionSettings.channelId),
            href: `/dashboard/${guildId}/community`,
            icon: 'fa-lightbulb'
        },
        {
            title: 'Voice Tools',
            description: 'Set a temp voice hub or enable voice rewards.',
            done: Boolean(tempVoiceHubChannelId || voiceSettings.enabled),
            href: `/dashboard/${guildId}/voice-tools`,
            icon: 'fa-microphone-lines'
        },
        {
            title: 'Support Tickets',
            description: 'Enable tickets and set at least one ticket destination.',
            done: Boolean(ticketSettings.enabled && (ticketSettings.categoryId || ticketSettings.logsChannelId)),
            href: `/dashboard/${guildId}/commands`,
            icon: 'fa-ticket'
        },
        {
            title: 'Safety Center',
            description: 'Configure raid protection or starboard settings.',
            done: Boolean(raidSettings.enabled || settings.starboardChannel),
            href: `/dashboard/${guildId}/safety`,
            icon: 'fa-user-shield'
        },
        {
            title: 'Live Alerts',
            description: 'Add at least one Twitch or YouTube alert.',
            done: Boolean(liveAlertsCount > 0),
            href: `/dashboard/${guildId}/live-alerts`,
            icon: 'fa-satellite-dish'
        }
    ];
};

/**
 * Summarizes setup progress from a checklist.
 */
const summarizeSetupProgress = (setupChecklist = []) => {
    const setupCompletedCount = setupChecklist.filter((item) => item.done).length;
    const setupProgressPercent = setupChecklist.length
        ? Math.round((setupCompletedCount / setupChecklist.length) * 100)
        : 0;

    return {
        setupCompletedCount,
        setupProgressPercent
    };
};

/**
 * Collects all setup-related context for a guild.
 */
const collectSetupContextForGuild = async (guildId) => {
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
    const liveAlertsCount = (liveAlerts.twitch?.length || 0) + (liveAlerts.youtube?.length || 0);

    const setupChecklist = buildSetupChecklist({
        guildId,
        settings,
        modSettings,
        modLogChannel,
        loggingChannel,
        suggestionSettings,
        ticketSettings,
        raidSettings,
        voiceSettings,
        tempVoiceHubChannelId,
        liveAlertsCount
    });

    return {
        settings,
        modSettings,
        modLogChannel,
        loggingChannel,
        suggestionSettings,
        ticketSettings,
        raidSettings,
        voiceSettings,
        tempVoiceHubChannelId,
        liveAlertsCount,
        setupChecklist,
        ...summarizeSetupProgress(setupChecklist)
    };
};

/**
 * Gets admin guilds that the bot is also in (excluding a specific guild).
 */
const getUserAdminGuildsInBot = (user, client, excludeGuildId = null) => {
    const { PermissionFlagsBits } = require('discord.js');
    const adminPermission = PermissionFlagsBits.Administrator;
    const allGuilds = Array.isArray(user?.guilds) ? user.guilds : [];

    return allGuilds.filter((guild) => {
        if (!guild || !guild.id) return false;
        if (excludeGuildId && guild.id === excludeGuildId) return false;
        if (!client.guilds.cache.has(guild.id)) return false;

        try {
            return (BigInt(guild.permissions) & adminPermission) === adminPermission;
        } catch {
            return false;
        }
    }).map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon || null
    }));
};

module.exports = {
    normalizeServerProfile,
    buildSetupChecklist,
    summarizeSetupProgress,
    collectSetupContextForGuild,
    getUserAdminGuildsInBot
};