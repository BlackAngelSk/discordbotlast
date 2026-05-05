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

class MinecraftStatusManager {
    constructor() {
        this.client = null;
        this.interval = null;
        this.data = { guilds: {} };
        this.inFlightGuilds = new Set();
    }

    async init(client) {
        this.client = client;

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

        this.startUpdater();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    getGuildConfig(guildId) {
        return this.data.guilds[guildId] || null;
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

            const message = await this.sendOrEditMessage(channel, config.messageId, this.buildStatusEmbed(guild, normalizedConfig, statusForEmbed));

            this.data.guilds[guildId] = {
                ...this.data.guilds[guildId],
                host: normalizedConfig.host,
                port: normalizedConfig.port,
                messageId: message?.id || config.messageId || null,
                lastCheckedAt: new Date().toISOString(),
                lastOnline: confirmedOnline,
                lastGoodStatus,
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
                    const message = await this.sendOrEditMessage(channel, current.messageId, this.buildErrorEmbed(guild, current, error.message || 'Update failed'));
                    current.messageId = message?.id || current.messageId || null;
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
            message = await channel.messages.fetch(messageId).catch(() => null);
        }

        if (message) {
            return message.edit({ embeds: [embed] });
        }

        return channel.send({ embeds: [embed] });
    }

    buildStatusEmbed(guild, config, status) {
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