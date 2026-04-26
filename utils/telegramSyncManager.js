const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'telegramSync.json');
const REQUEST_TIMEOUT = 15000;
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function httpsRequestJson(url, { method = 'GET', body = null, timeoutMs = REQUEST_TIMEOUT } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = https.request(url, {
            method,
            timeout: timeoutMs,
            headers: payload
                ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
                : undefined
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data || '{}');
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(new Error(parsed.description || `Telegram API HTTP ${res.statusCode}`));
                    }
                    resolve(parsed);
                } catch {
                    reject(new Error('Invalid JSON response from Telegram API'));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Telegram API request timed out'));
        });

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 'true' || value === 'on' || value === '1' || value === 1;
}

function normalizeChatId(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    // Accept numeric IDs (e.g. -1001234567890 or 123456789)
    if (/^-?\d+$/.test(normalized)) return normalized;
    // Accept @username for public channels/groups
    const withAt = normalized.startsWith('@') ? normalized : `@${normalized}`;
    if (/^@[A-Za-z][A-Za-z0-9_]{3,}$/.test(withAt)) return withAt;
    return null;
}

function truncate(value, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH) {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildDiscordToTelegramMessage(message, options = {}) {
    const guildName = message.guild?.name || 'Unknown Server';
    const channelName = message.channel?.name ? `#${message.channel.name}` : `#${message.channelId}`;
    const displayName = message.member?.displayName || message.author?.username || 'Unknown User';
    const username = message.author?.username || displayName;
    const body = String(message.content || '').trim();
    const attachmentUrls = options.includeAttachments !== false
        ? Array.from(message.attachments?.values?.() || []).slice(0, 4).map((entry) => entry.url).filter(Boolean)
        : [];

    const lines = [
        `Discord > ${guildName}`,
        `${channelName} | ${displayName} (@${username})`
    ];

    if (body) {
        lines.push('');
        lines.push(body);
    }

    if (attachmentUrls.length > 0) {
        lines.push('');
        lines.push('Attachments:');
        for (const url of attachmentUrls) {
            lines.push(url);
        }
    }

    if (!body && attachmentUrls.length === 0) {
        return null;
    }

    return truncate(lines.join('\n'));
}

function buildTelegramToDiscordMessage(msg) {
    const text = String(msg.text || msg.caption || '').trim();
    const attachmentHint = msg.photo
        ? '[Photo]'
        : msg.video
            ? '[Video]'
            : msg.document
                ? `[File: ${msg.document.file_name || 'document'}]`
                : msg.sticker
                    ? `[Sticker: ${msg.sticker.emoji || 'sticker'}]`
                    : '';

    const sender = msg.from?.username
        ? `@${msg.from.username}`
        : [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Telegram User';

    const chatLabel = msg.chat?.title || msg.chat?.username || msg.chat?.type || 'Telegram Chat';
    const contentParts = [text, attachmentHint].filter(Boolean);

    if (contentParts.length === 0) {
        return null;
    }

    return truncate(`📨 **Telegram** (${chatLabel})\n**${sender}:** ${contentParts.join(' ')}`, 1900);
}

class TelegramSyncManager {
    constructor() {
        this.data = {};
        this.client = null;
        this.pollTimer = null;
        this.pollInFlight = false;
        this.updateOffset = null;
        this.warnedMissingToken = false;
    }

    async init(client) {
        this.client = client;

        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw || '{}');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Telegram sync load error:', error.message);
            }
            this.data = {};
            await this.save();
        }

        if (this.getBotToken()) {
            await this._primeOffset();
            this._startPolling();
        } else if (!this.warnedMissingToken) {
            console.warn('Telegram sync disabled: TELEGRAM_BOT_TOKEN is missing.');
            this.warnedMissingToken = true;
        }
    }

    getBotToken() {
        return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    }

    hasBotToken() {
        return !!this.getBotToken();
    }

    getGuildConfig(guildId) {
        if (!this.data[guildId]) {
            this.data[guildId] = {
                enabled: false,
                discordChannelId: null,
                telegramChatId: null,
                syncDiscordToTelegram: true,
                syncTelegramToDiscord: true,
                includeAttachments: true,
                updatedAt: null
            };
        }

        const current = this.data[guildId];
        current.enabled = parseBoolean(current.enabled, false);
        current.discordChannelId = current.discordChannelId ? String(current.discordChannelId).trim() : null;
        current.telegramChatId = normalizeChatId(current.telegramChatId);
        current.syncDiscordToTelegram = parseBoolean(current.syncDiscordToTelegram, true);
        current.syncTelegramToDiscord = parseBoolean(current.syncTelegramToDiscord, true);
        current.includeAttachments = parseBoolean(current.includeAttachments, true);
        return current;
    }

    async updateGuildConfig(guildId, updates = {}) {
        const config = this.getGuildConfig(guildId);

        if (Object.prototype.hasOwnProperty.call(updates, 'discordChannelId')) {
            config.discordChannelId = String(updates.discordChannelId || '').trim() || null;
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'telegramChatId')) {
            const normalizedChatId = normalizeChatId(updates.telegramChatId);
            if (updates.telegramChatId && !normalizedChatId) {
                throw new Error('Telegram chat ID must be a number (e.g. -1001234567890) or a public @username');
            }
            config.telegramChatId = normalizedChatId;
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
            config.enabled = parseBoolean(updates.enabled, false);
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'syncDiscordToTelegram')) {
            config.syncDiscordToTelegram = parseBoolean(updates.syncDiscordToTelegram, true);
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'syncTelegramToDiscord')) {
            config.syncTelegramToDiscord = parseBoolean(updates.syncTelegramToDiscord, true);
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'includeAttachments')) {
            config.includeAttachments = parseBoolean(updates.includeAttachments, true);
        }

        if (config.enabled && !config.discordChannelId) {
            throw new Error('Discord channel is required when sync is enabled');
        }

        if (config.enabled && !config.telegramChatId) {
            throw new Error('Telegram chat ID is required when sync is enabled');
        }

        config.updatedAt = new Date().toISOString();
        await this.save();
        return config;
    }

    async disableGuild(guildId) {
        const config = this.getGuildConfig(guildId);
        config.enabled = false;
        config.updatedAt = new Date().toISOString();
        await this.save();
        return config;
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    async relayDiscordMessage(message) {
        if (!message?.guildId) return;

        const config = this.getGuildConfig(message.guildId);
        if (!config.enabled || !config.syncDiscordToTelegram) return;
        if (!config.discordChannelId || !config.telegramChatId) return;
        if (String(message.channelId) !== String(config.discordChannelId)) return;
        if (!this.hasBotToken()) return;

        const text = buildDiscordToTelegramMessage(message, {
            includeAttachments: config.includeAttachments
        });

        if (!text) return;

        await this._sendTelegramMessage(config.telegramChatId, text);
    }

    async sendTestToTelegram(guildId, requestedBy = 'Dashboard User') {
        const config = this.getGuildConfig(guildId);
        if (!config.telegramChatId) {
            throw new Error('Telegram chat ID is not configured');
        }
        if (!this.hasBotToken()) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in the bot environment');
        }

        await this._sendTelegramMessage(
            config.telegramChatId,
            truncate(`✅ Discord -> Telegram sync test\nGuild: ${guildId}\nRequested by: ${requestedBy}\nTime: ${new Date().toLocaleString()}`)
        );
    }

    async _sendTelegramMessage(chatId, text) {
        const token = this.getBotToken();
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in the bot environment');
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await httpsRequestJson(url, {
            method: 'POST',
            body: {
                chat_id: String(chatId),
                text: truncate(text),
                disable_web_page_preview: false
            }
        });

        if (!response.ok) {
            throw new Error(response.description || 'Telegram sendMessage failed');
        }
    }

    async _primeOffset() {
        try {
            const updates = await this._fetchUpdates({ timeout: 0, limit: 1, offset: -1 });
            if (Array.isArray(updates) && updates.length > 0) {
                this.updateOffset = updates[updates.length - 1].update_id + 1;
            }
        } catch (error) {
            console.error('Telegram sync offset init error:', error.message);
        }
    }

    _startPolling() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
        }
        this.pollTimer = setTimeout(() => this._pollLoop(), 1200);
    }

    async _pollLoop() {
        if (this.pollInFlight) {
            this.pollTimer = setTimeout(() => this._pollLoop(), 1500);
            return;
        }

        this.pollInFlight = true;
        try {
            if (!this.hasBotToken()) {
                return;
            }

            const updates = await this._fetchUpdates({ timeout: 20, offset: this.updateOffset });
            for (const update of updates) {
                this.updateOffset = update.update_id + 1;
                await this._processUpdate(update);
            }
        } catch (error) {
            console.error('Telegram sync polling error:', error.message);
        } finally {
            this.pollInFlight = false;
            this.pollTimer = setTimeout(() => this._pollLoop(), 1200);
        }
    }

    async _fetchUpdates({ timeout = 20, offset = null, limit = 30 } = {}) {
        const token = this.getBotToken();
        if (!token) return [];

        const query = new URLSearchParams();
        query.set('timeout', String(Math.max(0, Number(timeout) || 0)));
        query.set('limit', String(Math.max(1, Number(limit) || 30)));

        if (offset !== null && offset !== undefined) {
            query.set('offset', String(offset));
        }

        const url = `https://api.telegram.org/bot${token}/getUpdates?${query.toString()}`;
        const response = await httpsRequestJson(url, { method: 'GET', timeoutMs: (Number(timeout) + 12) * 1000 });

        if (!response.ok) {
            throw new Error(response.description || 'Telegram getUpdates failed');
        }

        return Array.isArray(response.result) ? response.result : [];
    }

    async _processUpdate(update) {
        const message = update?.message || update?.edited_message;
        if (!message || !message.chat) return;
        if (message.from?.is_bot) return;

        const telegramChatId = String(message.chat.id);
        const payload = buildTelegramToDiscordMessage(message);
        if (!payload) return;

        const matchingGuildIds = Object.keys(this.data).filter((guildId) => {
            const config = this.getGuildConfig(guildId);
            return config.enabled
                && config.syncTelegramToDiscord
                && config.telegramChatId
                && config.discordChannelId
                && String(config.telegramChatId) === telegramChatId;
        });

        for (const guildId of matchingGuildIds) {
            const config = this.getGuildConfig(guildId);
            const channel = this.client?.channels?.cache?.get(config.discordChannelId)
                || await this.client?.channels?.fetch?.(config.discordChannelId).catch(() => null);

            if (!channel || channel.type !== 0) {
                continue;
            }

            await channel.send({ content: payload }).catch(() => null);
        }
    }
}

module.exports = new TelegramSyncManager();
