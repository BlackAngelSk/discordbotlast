const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { fetchMinecraftServerStatus, normalizeMinecraftStatusInput } = require('./minecraftStatus');

const DATA_FILE = path.join(__dirname, '..', 'data', 'minecraftStatusEmbeds.json');
const DEFAULT_INTERVAL_MINUTES = 5;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 120;
const UPDATE_TICK_MS = 60 * 1000;
const OFFLINE_CONFIRMATION_CHECKS = 3;
const MINECRAFT_ICON_URL = 'https://cdn.discordapp.com/emojis/1218277823286202398.webp?size=128&quality=lossless';
const MAX_TRACKED_PLAYERS = 200;
const DISCORD_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const DISCORD_MAX_RETRY_ATTEMPTS = 3;
const DISCORD_RETRY_BASE_DELAY_MS = 1200;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeIntervalMinutes = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_INTERVAL_MINUTES;
    }

    return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(parsed)));
};

const formatAddress = (host, port) => [host, port].filter(Boolean).join(':');

const truncateText = (value, maxLength = 220) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, Math.max(0, maxLength - 1))}...`;
};

const toInlineCode = (value) => `\`${String(value || '').replace(/`/g, '\\`')}\``;

const toEmbedFieldValue = (value, fallback = 'Unknown', maxLength = 1024) => {
    const text = String(value ?? '').trim() || fallback;
    return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}...`;
};

const toCodeBlock = (value, maxLength = 900) => {
    const body = truncateText(String(value || '').replace(/```/g, "'''").trim(), maxLength);
    if (!body) return '';
    return `\`\`\`\n${body}\n\`\`\``;
};

const formatOnlinePlayerNames = (status) => {
    if (status?.online !== true) {
        return 'Unavailable';
    }

    const names = Array.isArray(status?.playerNames)
        ? status.playerNames.map((name) => truncateText(name, 32)).filter(Boolean)
        : [];

    if (!names.length) {
        const playersOnline = Number(status?.playersOnline || 0);
        return playersOnline > 0
            ? 'Online users are not exposed by this server.'
            : 'No users online';
    }

    const visibleNames = names.slice(0, 30);
    const remaining = names.length - visibleNames.length;
    const joined = visibleNames.join(', ');
    const suffix = remaining > 0 ? ` (+${remaining} more)` : '';
    return truncateText(`${joined}${suffix}`, 1000);
};

const buildPlayerProgressBar = (onlineCount, maxCount, size = 10) => {
    const online = Number(onlineCount);
    const max = Number(maxCount);
    if (!Number.isFinite(online) || !Number.isFinite(max) || max <= 0) {
        return '□□□□□□□□□□ 0%';
    }

    const ratio = Math.max(0, Math.min(1, online / max));
    const filled = Math.round(ratio * size);
    const empty = Math.max(0, size - filled);
    const percent = Math.round(ratio * 100);
    return `${'■'.repeat(filled)}${'□'.repeat(empty)} ${percent}%`;
};

const normalizePlayerNameKey = (value) => String(value || '').trim().toLowerCase();

const formatDuration = (ms) => {
    const safeMs = Number(ms);
    if (!Number.isFinite(safeMs) || safeMs <= 0) {
        return '0m';
    }

    const totalMinutes = Math.floor(safeMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
        return `${days}d ${hours}h`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
};

const normalizePlayerSessionTracker = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    const players = source.players && typeof source.players === 'object' ? source.players : {};

    const normalizedPlayers = {};
    for (const [key, entry] of Object.entries(players)) {
        if (!entry || typeof entry !== 'object') continue;

        const normalizedKey = normalizePlayerNameKey(key || entry.name);
        if (!normalizedKey) continue;

        normalizedPlayers[normalizedKey] = {
            name: String(entry.name || '').trim() || normalizedKey,
            totalOnlineMs: Math.max(0, Number(entry.totalOnlineMs || 0)),
            currentSessionStartedAt: entry.currentSessionStartedAt || null,
            lastSeenAt: entry.lastSeenAt || null,
            lastSessionMs: Math.max(0, Number(entry.lastSessionMs || 0)),
            updatedAt: entry.updatedAt || null
        };
    }

    return { players: normalizedPlayers };
};

const updatePlayerSessionTracker = (trackerInput, status, { confirmedOnline, nowMs }) => {
    const tracker = normalizePlayerSessionTracker(trackerInput);
    const players = tracker.players;
    const nowIso = new Date(nowMs).toISOString();
    const playersOnline = Math.max(0, Number(status?.playersOnline || 0));

    const closeSession = (entry) => {
        const startedMs = entry.currentSessionStartedAt ? new Date(entry.currentSessionStartedAt).getTime() : 0;
        if (startedMs > 0 && startedMs <= nowMs) {
            const elapsed = Math.max(0, nowMs - startedMs);
            entry.totalOnlineMs = Math.max(0, Number(entry.totalOnlineMs || 0)) + elapsed;
            entry.lastSessionMs = elapsed;
        }
        entry.currentSessionStartedAt = null;
        entry.updatedAt = nowIso;
    };

    if (confirmedOnline && status?.online === true) {
        const names = Array.isArray(status.playerNames)
            ? status.playerNames.map(name => String(name || '').trim()).filter(Boolean)
            : [];

        // When the server is online but reports zero players, any open tracked sessions are stale.
        if (playersOnline === 0) {
            for (const entry of Object.values(players)) {
                if (entry.currentSessionStartedAt) {
                    closeSession(entry);
                }
            }

            return tracker;
        }

        // Without exposed names there is no safe way to attribute time to specific players.
        if (names.length > 0) {
            const seen = new Set();
            for (const name of names) {
                const key = normalizePlayerNameKey(name);
                if (!key || seen.has(key)) continue;
                seen.add(key);

                if (!players[key]) {
                    players[key] = {
                        name,
                        totalOnlineMs: 0,
                        currentSessionStartedAt: nowIso,
                        lastSeenAt: nowIso,
                        lastSessionMs: 0,
                        updatedAt: nowIso
                    };
                }

                const entry = players[key];
                entry.name = name;
                if (!entry.currentSessionStartedAt) {
                    entry.currentSessionStartedAt = nowIso;
                }
                entry.lastSeenAt = nowIso;
                entry.updatedAt = nowIso;
            }

            for (const [key, entry] of Object.entries(players)) {
                if (!seen.has(key) && entry.currentSessionStartedAt) {
                    closeSession(entry);
                }
            }
        }
    } else {
        for (const entry of Object.values(players)) {
            if (entry.currentSessionStartedAt) {
                closeSession(entry);
            }
        }
    }

    const allEntries = Object.entries(players);
    if (allEntries.length > MAX_TRACKED_PLAYERS) {
        allEntries
            .sort((left, right) => {
                const leftStamp = new Date(left[1].updatedAt || left[1].lastSeenAt || 0).getTime() || 0;
                const rightStamp = new Date(right[1].updatedAt || right[1].lastSeenAt || 0).getTime() || 0;
                return rightStamp - leftStamp;
            })
            .slice(MAX_TRACKED_PLAYERS)
            .forEach(([key]) => {
                delete players[key];
            });
    }

    return tracker;
};

const formatPlayerSessionTimes = (status, trackerInput, nowMs = Date.now()) => {
    if (status?.online !== true) {
        return 'Unavailable';
    }

    const names = Array.isArray(status?.playerNames)
        ? status.playerNames.map(name => String(name || '').trim()).filter(Boolean)
        : [];

    if (!names.length) {
        const playersOnline = Number(status?.playersOnline || 0);
        return playersOnline > 0 ? 'Names hidden by server; tracking unavailable.' : 'No active sessions';
    }

    const tracker = normalizePlayerSessionTracker(trackerInput);
    const lines = [];
    const seen = new Set();

    for (const name of names) {
        const key = normalizePlayerNameKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const tracked = tracker.players[key];
        if (!tracked) {
            lines.push(`${truncateText(name, 24)}: <1m`);
            continue;
        }

        const startedMs = tracked.currentSessionStartedAt ? new Date(tracked.currentSessionStartedAt).getTime() : 0;
        const sessionMs = startedMs > 0 ? Math.max(0, nowMs - startedMs) : 0;
        lines.push(`${truncateText(name, 24)}: ${formatDuration(sessionMs)}`);
    }

    if (!lines.length) {
        return 'No active sessions';
    }

    const visible = lines.slice(0, 15);
    const remaining = lines.length - visible.length;
    const suffix = remaining > 0 ? `\n+${remaining} more player session(s)` : '';
    return truncateText(`${visible.join('\n')}${suffix}`, 1000);
};

class MinecraftStatusManager {
    constructor() {
        this.client = null;
        this.interval = null;
        this.data = { guilds: {} };
        this.inFlightGuilds = new Set();
    }

    async init(client) {
        this.client = client;
        let needsSave = false;

        try {
            await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading Minecraft status monitor config:', error);
            }
        }

        for (const [guildId, config] of Object.entries(this.data.guilds || {})) {
            if (!config || typeof config !== 'object') {
                this.data.guilds[guildId] = {
                    guildId,
                    enabled: false,
                    playerSessionTracker: { players: {} }
                };
                needsSave = true;
                continue;
            }

            const normalizedTracker = normalizePlayerSessionTracker(config.playerSessionTracker);
            if (JSON.stringify(normalizedTracker) !== JSON.stringify(config.playerSessionTracker || {})) {
                config.playerSessionTracker = normalizedTracker;
                needsSave = true;
            }
        }

        if (needsSave) {
            await this.save();
        }

        this.startUpdater();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    isDiscordTransientError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }

        if (DISCORD_RETRYABLE_STATUSES.has(Number(error.status))) {
            return true;
        }

        const code = String(error.code || '').toUpperCase();
        return code === 'ECONNRESET'
            || code === 'ETIMEDOUT'
            || code === 'ENOTFOUND'
            || code === 'UND_ERR_CONNECT_TIMEOUT';
    }

    isDiscordMessageMissingError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }

        return Number(error.status) === 404 || Number(error.code) === 10008;
    }

    async withDiscordRetry(operation, contextLabel) {
        let lastError = null;

        for (let attempt = 1; attempt <= DISCORD_MAX_RETRY_ATTEMPTS; attempt += 1) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const retryable = this.isDiscordTransientError(error);
                if (!retryable || attempt >= DISCORD_MAX_RETRY_ATTEMPTS) {
                    throw error;
                }

                const jitterMs = Math.floor(Math.random() * 300);
                const waitMs = DISCORD_RETRY_BASE_DELAY_MS * attempt + jitterMs;
                console.warn(`Minecraft status ${contextLabel} transient Discord error (attempt ${attempt}/${DISCORD_MAX_RETRY_ATTEMPTS}, status ${error.status || 'n/a'}). Retrying in ${waitMs}ms.`);
                await delay(waitMs);
            }
        }

        throw lastError;
    }

    getGuildConfig(guildId) {
        const config = this.data.guilds[guildId] || null;
        if (!config) return null;

        config.playerSessionTracker = normalizePlayerSessionTracker(config.playerSessionTracker);
        return config;
    }

    getPlayerSessionSummary(guildId, status) {
        const config = this.getGuildConfig(guildId);
        return formatPlayerSessionTimes(status, config?.playerSessionTracker || null, Date.now());
    }

    async configureMonitor(guildId, { channelId, host, port, intervalMinutes }) {
        const previous = this.getGuildConfig(guildId);
        const normalizedInterval = normalizeIntervalMinutes(intervalMinutes);
        const channelChanged = previous && previous.channelId !== channelId;

        this.data.guilds[guildId] = {
            ...(previous || {}),
            guildId,
            channelId,
            host,
            port: port || null,
            intervalMinutes: normalizedInterval,
            enabled: true,
            messageId: channelChanged ? null : (previous?.messageId || null),
            lastGoodStatus: previous?.lastGoodStatus || null,
            playerSessionTracker: normalizePlayerSessionTracker(previous?.playerSessionTracker),
            consecutiveOfflineChecks: 0,
            lastError: null,
            nextUpdateAt: null
        };

        await this.save();
        return this.refreshGuildStatus(guildId, { force: true });
    }

    async disableMonitor(guildId) {
        delete this.data.guilds[guildId];
        await this.save();
    }

    startUpdater() {
        if (this.interval) {
            clearInterval(this.interval);
        }

        this.interval = setInterval(() => {
            this.updateDueStatuses().catch(error => {
                console.error('Minecraft status monitor tick error:', error);
            });
        }, UPDATE_TICK_MS);

        setTimeout(() => {
            this.updateDueStatuses().catch(error => {
                console.error('Minecraft status startup refresh error:', error);
            });
        }, 20000);
    }

    async updateDueStatuses() {
        const now = Date.now();
        for (const [guildId, config] of Object.entries(this.data.guilds || {})) {
            if (!config?.enabled) continue;

            const nextUpdateAt = config.nextUpdateAt ? new Date(config.nextUpdateAt).getTime() : 0;
            if (!nextUpdateAt || nextUpdateAt <= now) {
                await this.refreshGuildStatus(guildId);
            }
        }
    }

    async refreshGuildStatus(guildId, { force = false } = {}) {
        const config = this.getGuildConfig(guildId);
        if (!config || !this.client) {
            return null;
        }

        const nextUpdateAt = config.nextUpdateAt ? new Date(config.nextUpdateAt).getTime() : 0;
        if (!force && nextUpdateAt && nextUpdateAt > Date.now()) {
            return config;
        }

        if (this.inFlightGuilds.has(guildId)) {
            return config;
        }

        this.inFlightGuilds.add(guildId);
        try {
            const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                throw new Error('Guild not found for Minecraft status monitor.');
            }

            const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
            if (!channel || !channel.isTextBased?.()) {
                throw new Error('Configured Minecraft status channel is not available.');
            }

            const normalizedAddress = normalizeMinecraftStatusInput(config.host, config.port);
            if (normalizedAddress.error) {
                throw new Error(normalizedAddress.error);
            }

            const normalizedConfig = {
                ...config,
                host: normalizedAddress.host,
                port: normalizedAddress.port
            };

            const status = await fetchMinecraftServerStatus(normalizedConfig.host, normalizedConfig.port);
            const previous = this.data.guilds[guildId] || {};
            const nowMs = Date.now();

            let statusForEmbed = status;
            let nextOfflineChecks = 0;
            let confirmedOnline = status.online === true;
            let lastGoodStatus = previous.lastGoodStatus || null;

            if (status.online === true) {
                nextOfflineChecks = 0;
                lastGoodStatus = {
                    ...status,
                    stale: false,
                    offlineCheckCount: 0,
                    offlineCheckThreshold: OFFLINE_CONFIRMATION_CHECKS
                };
            } else {
                nextOfflineChecks = Number(previous.consecutiveOfflineChecks || 0) + 1;
                const shouldDelayOffline = previous.lastOnline === true
                    && !!previous.lastGoodStatus
                    && nextOfflineChecks < OFFLINE_CONFIRMATION_CHECKS;

                if (shouldDelayOffline) {
                    statusForEmbed = {
                        ...previous.lastGoodStatus,
                        stale: true,
                        offlineCheckCount: nextOfflineChecks,
                        offlineCheckThreshold: OFFLINE_CONFIRMATION_CHECKS,
                        staleObservedStatus: status
                    };
                    confirmedOnline = true;
                } else {
                    statusForEmbed = {
                        ...status,
                        stale: false,
                        offlineCheckCount: nextOfflineChecks,
                        offlineCheckThreshold: OFFLINE_CONFIRMATION_CHECKS
                    };
                    confirmedOnline = false;
                }
            }

            const playerSessionTracker = updatePlayerSessionTracker(previous.playerSessionTracker, statusForEmbed, {
                confirmedOnline,
                nowMs
            });

            const message = await this.sendOrEditMessage(channel, config.messageId, this.buildStatusEmbed(guild, normalizedConfig, statusForEmbed, playerSessionTracker));

            this.data.guilds[guildId] = {
                ...this.data.guilds[guildId],
                host: normalizedConfig.host,
                port: normalizedConfig.port,
                messageId: message?.id || config.messageId || null,
                lastCheckedAt: new Date().toISOString(),
                lastOnline: confirmedOnline,
                lastGoodStatus,
                playerSessionTracker,
                consecutiveOfflineChecks: nextOfflineChecks,
                lastError: null,
                nextUpdateAt: new Date(Date.now() + normalizeIntervalMinutes(config.intervalMinutes) * 60 * 1000).toISOString()
            };
            await this.save();
            return this.data.guilds[guildId];
        } catch (error) {
            console.error('Minecraft status refresh error:', error);

            const current = this.data.guilds[guildId];
            if (current) {
                current.lastCheckedAt = new Date().toISOString();
                current.lastOnline = false;
                current.lastError = error.message || 'Update failed';
                current.nextUpdateAt = new Date(Date.now() + normalizeIntervalMinutes(current.intervalMinutes) * 60 * 1000).toISOString();

                const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
                const channel = guild ? (guild.channels.cache.get(current.channelId) || await guild.channels.fetch(current.channelId).catch(() => null)) : null;
                if (channel?.isTextBased?.()) {
                    try {
                        const message = await this.sendOrEditMessage(channel, current.messageId, this.buildErrorEmbed(guild, current, error.message || 'Update failed'));
                        current.messageId = message?.id || current.messageId || null;
                    } catch (secondaryError) {
                        console.warn('Minecraft status fallback message update failed:', secondaryError?.message || secondaryError);
                    }
                }

                await this.save();
            }

            return current || null;
        } finally {
            this.inFlightGuilds.delete(guildId);
        }
    }

    async sendOrEditMessage(channel, messageId, embed) {
        let message = null;
        if (messageId) {
            try {
                message = await this.withDiscordRetry(
                    () => channel.messages.fetch(messageId),
                    'message fetch'
                );
            } catch (error) {
                if (!this.isDiscordMessageMissingError(error)) {
                    throw error;
                }
            }
        }

        if (message) {
            return this.withDiscordRetry(
                () => message.edit({ embeds: [embed] }),
                'message edit'
            );
        }

        return this.withDiscordRetry(
            () => channel.send({ embeds: [embed] }),
            'message send'
        );
    }

    buildStatusEmbed(guild, config, status, playerSessionTracker = null) {
        const online = status.online === true;
        const color = online ? 0x57F287 : 0xED4245;
        const address = formatAddress(status.hostname || config.host, status.port || config.port);
        const refreshMinutes = normalizeIntervalMinutes(config.intervalMinutes);
        const nowUnix = Math.floor(Date.now() / 1000);
        const nextRefreshUnix = Math.floor((Date.now() + refreshMinutes * 60 * 1000) / 1000);
        const statusLabel = online ? 'Online' : 'Offline';
        const statusEmoji = online ? '🟢' : '🔴';
        const playersText = online
            ? `${status.playersOnline} / ${status.playersMax}`
            : 'Unavailable';
        const playerNamesText = formatOnlinePlayerNames(status);
        const playerSessionText = formatPlayerSessionTimes(status, playerSessionTracker, Date.now());
        const playerBar = online
            ? buildPlayerProgressBar(status.playersOnline, status.playersMax)
            : '□□□□□□□□□□ 0%';
        const motdText = truncateText(status.motd, 700);
        const stale = status?.stale === true;
        const offlineCheckCount = Number(status?.offlineCheckCount || 0);
        const offlineCheckThreshold = Number(status?.offlineCheckThreshold || OFFLINE_CONFIRMATION_CHECKS);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${statusEmoji} Minecraft Server ${statusLabel}`)
            .setAuthor({ name: guild?.name ? `${guild.name} - Live Monitor` : 'Minecraft Live Monitor' })
            .setDescription([
                `### ${statusEmoji} Status: **${statusLabel}**`,
                `Tracking ${toInlineCode(address || formatAddress(config.host, config.port) || 'unknown-address')}`,
                `Last check <t:${nowUnix}:R> - Next refresh <t:${nextRefreshUnix}:R>`,
                stale ? `⚠️ Received temporary offline response (${offlineCheckCount}/${offlineCheckThreshold}). Keeping last known online state until confirmed.` : null
            ].filter(Boolean).join('\n'))
            .setThumbnail(MINECRAFT_ICON_URL)
            .addFields(
                { name: '📍 Address', value: toEmbedFieldValue(toInlineCode(address || 'Unknown')), inline: false },
                { name: '🌐 Resolved IP', value: toEmbedFieldValue(toInlineCode(status.ip || 'Unknown')), inline: true },
                { name: '👥 Players', value: toEmbedFieldValue(playersText), inline: true },
                { name: '📈 Capacity', value: toEmbedFieldValue(playerBar), inline: true },
                { name: '🧍 Online Users', value: toEmbedFieldValue(playerNamesText), inline: false },
                { name: '⏱️ Session Time', value: toEmbedFieldValue(playerSessionText), inline: false },
                { name: '🧩 Version', value: toEmbedFieldValue(status.version || 'Unknown'), inline: true },
                { name: '🛠️ Software', value: toEmbedFieldValue(status.software || 'Unknown'), inline: true },
                { name: '🔁 Interval', value: toEmbedFieldValue(`Every ${refreshMinutes} minute${refreshMinutes === 1 ? '' : 's'}`), inline: true },
                { name: '🏠 Guild', value: toEmbedFieldValue(guild?.name || 'Unknown server'), inline: true }
            )
            .setFooter({ text: 'Minecraft status monitor' })
            .setTimestamp();

        if (online && motdText) {
            embed.addFields({ name: '💬 MOTD', value: toEmbedFieldValue(toCodeBlock(motdText), 'No MOTD available'), inline: false });
        }

        return embed;
    }

    buildErrorEmbed(guild, config, errorMessage) {
        const refreshMinutes = normalizeIntervalMinutes(config.intervalMinutes);
        const nextRefreshUnix = Math.floor((Date.now() + refreshMinutes * 60 * 1000) / 1000);
        const address = formatAddress(config.host, config.port) || 'unknown-address';

        return new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🟡 Minecraft Status Update Delayed')
            .setAuthor({ name: guild?.name ? `${guild.name} - Live Monitor` : 'Minecraft Live Monitor' })
            .setDescription([
                `Could not refresh ${toInlineCode(address)} right now.`,
                `The monitor will continue automatically on the next cycle.`
            ].join('\n'))
            .setThumbnail(MINECRAFT_ICON_URL)
            .addFields(
                { name: '⚠️ Reason', value: toEmbedFieldValue(toCodeBlock(truncateText(errorMessage, 500)), 'Unknown error'), inline: false },
                { name: '🔁 Retry Interval', value: toEmbedFieldValue(`Every ${refreshMinutes} minute${refreshMinutes === 1 ? '' : 's'}`), inline: true },
                { name: '⏭️ Next Retry', value: toEmbedFieldValue(`<t:${nextRefreshUnix}:R>`), inline: true },
                { name: '🏠 Guild', value: toEmbedFieldValue(guild?.name || 'Unknown server'), inline: true }
            )
            .setFooter({ text: 'Minecraft status monitor will retry automatically' })
            .setTimestamp();
    }
}

module.exports = {
    minecraftStatusManager: new MinecraftStatusManager(),
    DEFAULT_INTERVAL_MINUTES,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    normalizeIntervalMinutes
};