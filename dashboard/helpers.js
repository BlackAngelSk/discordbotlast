/**
 * Dashboard Helper Utilities
 * Shared functions used across dashboard modules.
 */

const fs = require('fs');
const path = require('path');

/**
 * Wraps a promise with a timeout. Returns null if the promise doesn't resolve in time.
 */
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

/**
 * Resolves a username from a guild member cache or fetch.
 */
const resolveGuildUsername = async (guild, userId) => {
    if (!guild) return `Unknown (${userId})`;
    const cached = guild.members?.cache?.get(userId);
    if (cached) return cached.user?.username || `Unknown (${userId})`;
    const member = await withTimeout(guild.members.fetch(userId).catch(() => null), 3000);
    return member ? member.user.username : `Unknown (${userId})`;
};

/**
 * Resolves a username from the global user cache or fetch.
 */
const resolveGlobalUsername = async (client, userId) => {
    const cached = client.users?.cache?.get(userId);
    if (cached) return cached.username || `Unknown (${userId})`;
    const user = await withTimeout(client.users.fetch(userId).catch(() => null), 3000);
    return user ? user.username : `Unknown (${userId})`;
};

/**
 * Safely reads and parses a JSON file. Returns fallback on error.
 */
const readJsonFile = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
};

/**
 * Normalizes a text input value, trimming and limiting length.
 */
const normalizeTextInput = (value, fallback, maxLength = 256) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return String(fallback || '');
    return trimmed.slice(0, maxLength);
};

/**
 * Normalizes a boolean input from form values.
 */
const normalizeBooleanInput = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return fallback;
};

/**
 * Normalizes a hex color input to uppercase #RRGGBB format.
 */
const normalizeHexColorInput = (value, fallback = '#5865F2') => {
    const normalized = String(value || '').trim();
    const candidate = normalized.startsWith('#') ? normalized.slice(1) : normalized;
    if (!candidate) return fallback;
    if (!/^[0-9A-Fa-f]{6}$/.test(candidate)) return fallback;
    return `#${candidate.toUpperCase()}`;
};

/**
 * Normalizes a Discord embed color value to a CSS hex string.
 */
const normalizeEmbedPreviewColor = (colorValue) => {
    const parsed = Number(colorValue);
    const safeValue = Number.isFinite(parsed) ? parsed : 0x5865F2;
    return `#${safeValue.toString(16).padStart(6, '0')}`;
};

/**
 * Parses a dashboard boolean value from various input types.
 */
const parseDashboardBoolean = (value) => value === true || value === 'true' || value === 'on' || value === '1' || value === 1;

/**
 * Resolves a stored channel ID or name to an actual channel object.
 */
const resolveStoredTextChannel = (guild, storedValue) => {
    const normalizedValue = String(storedValue || '').trim();
    if (!guild || !normalizedValue) return null;

    return guild.channels.cache.get(normalizedValue)
        || guild.channels.cache.find((channel) => channel.type === 0 && channel.name === normalizedValue)
        || null;
};

/**
 * Replaces template tokens in a welcome/leave message.
 */
const replaceMemberTemplateTokens = (template, member, guild) => {
    return String(template || '')
        .replaceAll('{user}', member ? `<@${member.id}>` : 'Test User')
        .replaceAll('{server}', guild?.name || 'Server');
};

/**
 * Finds a channel by ID or name in a guild.
 */
const findChannelByIdOrName = (guild, channelRef) => {
    const normalized = String(channelRef || '').trim();
    if (!guild || !normalized) return null;
    return guild.channels.cache.get(normalized)
        || guild.channels.cache.find((channel) => String(channel.name || '').toLowerCase() === normalized.toLowerCase())
        || null;
};

/**
 * Finds a role by ID or name in a guild.
 */
const findRoleByIdOrName = (guild, roleRef) => {
    const normalized = String(roleRef || '').trim();
    if (!guild || !normalized) return null;
    return guild.roles.cache.get(normalized)
        || guild.roles.cache.find((role) => String(role.name || '').toLowerCase() === normalized.toLowerCase())
        || null;
};

/**
 * Sanitizes a backup name to be filesystem-safe.
 */
const sanitizeBackupName = (value) => String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'backup';

/**
 * Ensures the dashboard backups directory exists.
 */
const ensureDashboardBackupsDir = async (dir) => {
    await fs.promises.mkdir(dir, { recursive: true });
};

/**
 * Applies template tokens to a preview string.
 */
const applyPreviewTemplate = (template, context = {}) => String(template || '').replace(/\{(\w+)\}/g, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(context, token)) {
        return match;
    }
    return String(context[token] ?? '');
});

module.exports = {
    withTimeout,
    resolveGuildUsername,
    resolveGlobalUsername,
    readJsonFile,
    normalizeTextInput,
    normalizeBooleanInput,
    normalizeHexColorInput,
    normalizeEmbedPreviewColor,
    parseDashboardBoolean,
    resolveStoredTextChannel,
    replaceMemberTemplateTokens,
    findChannelByIdOrName,
    findRoleByIdOrName,
    sanitizeBackupName,
    ensureDashboardBackupsDir,
    applyPreviewTemplate
};