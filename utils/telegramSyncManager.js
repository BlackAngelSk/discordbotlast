const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { AttachmentBuilder, ChannelType } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'data', 'telegramSync.json');
const REQUEST_TIMEOUT = 15000;
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_MAX_CAPTION_LENGTH = 1024;
const TELEGRAM_MAX_DOWNLOAD_BYTES = getPositiveInteger(process.env.TELEGRAM_SYNC_MAX_DOWNLOAD_BYTES, 12 * 1024 * 1024);
const TELEGRAM_POLL_CONCURRENCY = getPositiveInteger(process.env.TELEGRAM_SYNC_POLL_CONCURRENCY, 3);
const TELEGRAM_MAX_MEDIA_PER_MESSAGE = getPositiveInteger(process.env.TELEGRAM_SYNC_MAX_MEDIA_PER_MESSAGE, 4);
const RETRY_ATTEMPTS = 3;

function getPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error) {
    const text = String(error?.message || '').toLowerCase();
    return /(timeout|timed out|econnreset|socket hang up|enotfound|eai_again|429|502|503|504|rate limit)/.test(text);
}

async function withRetry(task, label, attempts = RETRY_ATTEMPTS) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !isTransientError(error)) {
                throw error;
            }
            const delayMs = 250 * attempt;
            console.warn(`[Telegram Sync] ${label} failed (attempt ${attempt}/${attempts}): ${error.message}. Retrying in ${delayMs}ms`);
            await wait(delayMs);
        }
    }
    throw lastError;
}

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

function downloadBinary(url, { timeoutMs = REQUEST_TIMEOUT, maxBytes = TELEGRAM_MAX_DOWNLOAD_BYTES } = {}) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, {
            timeout: timeoutMs,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(downloadBinary(res.headers.location, { timeoutMs, maxBytes }));
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const contentLength = Number(res.headers['content-length'] || 0);
            if (contentLength > 0 && contentLength > maxBytes) {
                res.destroy();
                return reject(new Error(`File too large (${contentLength} bytes > ${maxBytes} bytes)`));
            }

            const chunks = [];
            let totalBytes = 0;
            res.on('data', (chunk) => {
                totalBytes += chunk.length;
                if (totalBytes > maxBytes) {
                    res.destroy(new Error(`File too large (${totalBytes} bytes > ${maxBytes} bytes)`));
                    return;
                }
                chunks.push(chunk);
            });

            res.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
        }).on('error', reject).on('timeout', function() {
            this.destroy(new Error('Download timed out'));
        });
    });
}

function httpsRequestBuffer(url, {
    method = 'POST',
    headers = {},
    body = null,
    timeoutMs = REQUEST_TIMEOUT
} = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method,
            timeout: timeoutMs,
            headers
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

        if (body) {
            req.write(body);
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
    const maxLength = Number(options.maxLength) > 0 ? Number(options.maxLength) : TELEGRAM_MAX_MESSAGE_LENGTH;
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

    return truncate(lines.join('\n'), maxLength);
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
                    : msg.animation
                        ? '[GIF]'
                    : '';

    const sender = msg.from?.username
        ? `@${msg.from.username}`
        : [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
            || (msg.sender_chat?.username ? `@${msg.sender_chat.username}` : msg.sender_chat?.title)
            || 'Telegram User';

    const chatLabel = msg.chat?.title || msg.chat?.username || msg.chat?.type || 'Telegram Chat';
    const contentParts = [text, attachmentHint].filter(Boolean);

    if (contentParts.length === 0) {
        return null;
    }

    return truncate(`📨 **Telegram** (${chatLabel})\n**${sender}:** ${contentParts.join(' ')}`, 1900);
}

function getTelegramMediaInfo(message) {
    if (Array.isArray(message?.photo) && message.photo.length > 0) {
        const largestPhoto = message.photo[message.photo.length - 1];
        return {
            kind: 'photo',
            fileId: largestPhoto.file_id,
            extension: '.jpg'
        };
    }

    if (message?.video?.file_id) {
        const ext = path.extname(String(message.video.file_name || '')).toLowerCase() || '.mp4';
        return {
            kind: 'video',
            fileId: message.video.file_id,
            extension: ext
        };
    }

    if (message?.animation?.file_id) {
        const ext = path.extname(String(message.animation.file_name || '')).toLowerCase() || '.gif';
        return {
            kind: 'animation',
            fileId: message.animation.file_id,
            extension: ext
        };
    }

    if (message?.document?.file_id) {
        const ext = path.extname(String(message.document.file_name || '')).toLowerCase() || '.bin';
        return {
            kind: 'document',
            fileId: message.document.file_id,
            extension: ext
        };
    }

    return null;
}

function getDiscordAttachmentTransport(attachment) {
    const contentType = String(attachment?.contentType || '').toLowerCase();
    const name = String(attachment?.name || '').toLowerCase();

    if ((contentType.startsWith('image/') && !contentType.includes('gif')) || /\.(png|jpe?g|webp)$/i.test(name)) {
        return { method: 'sendPhoto', fieldName: 'photo' };
    }

    if (contentType === 'image/gif' || /\.gif$/i.test(name)) {
        return { method: 'sendAnimation', fieldName: 'animation' };
    }

    if (contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(name)) {
        return { method: 'sendVideo', fieldName: 'video' };
    }

    return { method: 'sendDocument', fieldName: 'document' };
}

function buildMultipartPayload(fields, file) {
    const boundary = `----TelegramSync${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const parts = [];

    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null || value === '') continue;
        parts.push(Buffer.from(
            `--${boundary}\r\n`
            + `Content-Disposition: form-data; name="${key}"\r\n\r\n`
            + `${String(value)}\r\n`
        ));
    }

    parts.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\n`
        + `Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`
    ));
    parts.push(file.buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    return {
        boundary,
        body: Buffer.concat(parts)
    };
}

async function mapWithConcurrency(items, concurrency, worker) {
    const limit = Math.max(1, Number(concurrency) || 1);
    let nextIndex = 0;

    async function runner() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(items[currentIndex], currentIndex);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
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

        const fullText = buildDiscordToTelegramMessage(message, {
            includeAttachments: false,
            maxLength: TELEGRAM_MAX_MESSAGE_LENGTH
        });
        const captionText = fullText && fullText.length <= TELEGRAM_MAX_CAPTION_LENGTH
            ? fullText
            : null;
        const mediaAttachments = config.includeAttachments !== false
            ? Array.from(message.attachments?.values?.() || []).slice(0, TELEGRAM_MAX_MEDIA_PER_MESSAGE)
            : [];

        let sentMedia = false;
        let usedCaption = false;

        for (const attachment of mediaAttachments) {
            const preparedAttachment = await this._prepareDiscordAttachmentForTelegram(attachment);
            if (!preparedAttachment) {
                continue;
            }

            const caption = !usedCaption && captionText ? captionText : null;
            await this._sendTelegramMedia(config.telegramChatId, {
                ...preparedAttachment,
                caption
            });

            sentMedia = true;
            usedCaption = usedCaption || !!caption;
        }

        if (fullText && (!sentMedia || !usedCaption)) {
            await this._sendTelegramMessage(config.telegramChatId, fullText);
        }
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

    async _getTelegramFileInfo(fileId) {
        const token = this.getBotToken();
        if (!token) return null;

        try {
            const response = await withRetry(
                () => httpsRequestJson(
                    `https://api.telegram.org/bot${token}/getFile`,
                    {
                        method: 'POST',
                        body: { file_id: fileId }
                    }
                ),
                'Telegram getFile request'
            );

            if (!response.ok || !response.result?.file_path) {
                console.error('[Telegram Sync] Failed to get file path:', response.description);
                return null;
            }

            return {
                url: `https://api.telegram.org/file/bot${token}/${response.result.file_path}`,
                filePath: response.result.file_path
            };
        } catch (error) {
            console.error('[Telegram Sync] Error getting file URL:', error.message);
            return null;
        }
    }

    async _downloadTelegramFile(fileUrl) {
        try {
            if (!fileUrl) return null;
            const buffer = await withRetry(
                () => downloadBinary(fileUrl, { timeoutMs: 30000, maxBytes: TELEGRAM_MAX_DOWNLOAD_BYTES }),
                'Telegram media download'
            );
            return buffer;
        } catch (error) {
            console.error('[Telegram Sync] Failed to download media from Telegram:', error.message);
            return null;
        }
    }

    async _downloadDiscordAttachment(attachmentUrl) {
        try {
            if (!attachmentUrl) return null;
            return await withRetry(
                () => downloadBinary(attachmentUrl, { timeoutMs: 30000, maxBytes: TELEGRAM_MAX_DOWNLOAD_BYTES }),
                'Discord attachment download'
            );
        } catch (error) {
            console.error('[Telegram Sync] Failed to download Discord attachment:', error.message);
            return null;
        }
    }

    async _sendDiscordMessage(channel, payload) {
        return withRetry(() => channel.send(payload), 'Discord channel.send');
    }

    async _prepareDiscordAttachmentForTelegram(attachment) {
        if (!attachment?.url) {
            return null;
        }

        if (Number(attachment.size) > TELEGRAM_MAX_DOWNLOAD_BYTES) {
            console.warn(`[Telegram Sync] Skipping Discord attachment ${attachment.name || attachment.id}: file too large (${attachment.size} bytes)`);
            return null;
        }

        const buffer = await this._downloadDiscordAttachment(attachment.url);
        if (!buffer) {
            return null;
        }

        const transport = getDiscordAttachmentTransport(attachment);
        return {
            ...transport,
            buffer,
            fileName: attachment.name || `${attachment.id || 'attachment'}.bin`,
            contentType: attachment.contentType || 'application/octet-stream'
        };
    }

    async _getRelayChannel(guildId) {
        const config = this.getGuildConfig(guildId);
        const channel = this.client?.channels?.cache?.get(config.discordChannelId)
            || await this.client?.channels?.fetch?.(config.discordChannelId).catch(() => null);

        if (!channel) {
            console.error(`[Telegram Sync] Discord channel ${config.discordChannelId} not found`);
            return null;
        }

        if (channel.type !== ChannelType.GuildText) {
            console.error(`[Telegram Sync] Discord channel ${config.discordChannelId} is not a guild text channel (type: ${channel.type})`);
            return null;
        }

        return channel;
    }

    async _sendTelegramMessage(chatId, text) {
        const token = this.getBotToken();
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in the bot environment');
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await withRetry(
            () => httpsRequestJson(url, {
                method: 'POST',
                body: {
                    chat_id: String(chatId),
                    text: truncate(text),
                    disable_web_page_preview: false
                }
            }),
            'Telegram sendMessage request'
        );

        if (!response.ok) {
            throw new Error(response.description || 'Telegram sendMessage failed');
        }
    }

    async _sendTelegramMedia(chatId, media) {
        const token = this.getBotToken();
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in the bot environment');
        }

        const payload = buildMultipartPayload({
            chat_id: String(chatId),
            caption: media.caption ? truncate(media.caption, TELEGRAM_MAX_CAPTION_LENGTH) : null
        }, {
            fieldName: media.fieldName,
            fileName: media.fileName,
            contentType: media.contentType,
            buffer: media.buffer
        });

        const url = `https://api.telegram.org/bot${token}/${media.method}`;
        const response = await withRetry(
            () => httpsRequestBuffer(url, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${payload.boundary}`,
                    'Content-Length': String(payload.body.length)
                },
                body: payload.body,
                timeoutMs: 45000
            }),
            `Telegram ${media.method} request`
        );

        if (!response.ok) {
            throw new Error(response.description || `Telegram ${media.method} failed`);
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

    _hasTelegramToDiscordTargets() {
        return Object.keys(this.data).some((guildId) => {
            const config = this.getGuildConfig(guildId);
            return config.enabled
                && config.syncTelegramToDiscord
                && config.telegramChatId
                && config.discordChannelId;
        });
    }

    _findMatchingGuildIds(message) {
        const telegramChatId = String(message?.chat?.id || '').trim();
        const usernameCandidates = [
            message?.chat?.username,
            message?.from?.username,
            message?.sender_chat?.username
        ]
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean)
            .map((entry) => (entry.startsWith('@') ? entry : `@${entry}`));

        const usernameSet = new Set(usernameCandidates);

        return Object.keys(this.data).filter((guildId) => {
            const config = this.getGuildConfig(guildId);
            const configuredChat = String(config.telegramChatId || '').trim();
            const configuredUsername = configuredChat.startsWith('@')
                ? configuredChat.toLowerCase()
                : '';

            return config.enabled
                && config.syncTelegramToDiscord
                && configuredChat
                && config.discordChannelId
                && (
                    configuredChat === telegramChatId
                    || (configuredUsername && usernameSet.has(configuredUsername))
                );
        });
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

            if (!this._hasTelegramToDiscordTargets()) {
                return;
            }

            const updates = await this._fetchUpdates({ timeout: 20, offset: this.updateOffset });
            if (updates.length > 0) {
                console.log(`[Telegram Sync] Received ${updates.length} update(s)`);
                this.updateOffset = updates[updates.length - 1].update_id + 1;
            }
            await mapWithConcurrency(updates, TELEGRAM_POLL_CONCURRENCY, async (update) => {
                try {
                    await this._processUpdate(update);
                } catch (error) {
                    console.error('[Telegram Sync] Update processing error:', error.message);
                }
            });
        } catch (error) {
            if (!/timeout/i.test(error.message)) {
                console.error('[Telegram Sync] Polling error:', error.message);
            }
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
        const response = await withRetry(
            () => httpsRequestJson(url, { method: 'GET', timeoutMs: (Number(timeout) + 12) * 1000 }),
            'Telegram getUpdates request'
        );

        if (!response.ok) {
            throw new Error(response.description || 'Telegram getUpdates failed');
        }

        return Array.isArray(response.result) ? response.result : [];
    }

    async _processUpdate(update) {
        const message = update?.message
            || update?.edited_message
            || update?.channel_post
            || update?.edited_channel_post;
        if (!message || !message.chat) return;
        if (message.from?.is_bot) {
            console.debug(`[Telegram Sync] Skipping bot message from chat ${message.chat.id}`);
            return;
        }

        const telegramChatId = String(message.chat.id);
        const matchingGuildIds = this._findMatchingGuildIds(message);
        if (matchingGuildIds.length === 0) {
            const observedUsernames = [
                message?.chat?.username,
                message?.from?.username,
                message?.sender_chat?.username
            ]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .map((value) => (value.startsWith('@') ? value : `@${value}`));

            const configuredTargets = Object.keys(this.data)
                .map((guildId) => this.getGuildConfig(guildId))
                .filter((config) => config.enabled && config.syncTelegramToDiscord && config.discordChannelId)
                .map((config) => config.telegramChatId)
                .filter(Boolean);

            console.warn(
                `[Telegram Sync] Ignoring update: no Telegram->Discord route matched. `
                + `chat.id=${telegramChatId}, observed usernames=${observedUsernames.join(', ') || 'none'}, `
                + `configured targets=${configuredTargets.join(', ') || 'none'}`
            );
            return;
        }

        console.log(`[Telegram Sync] Processing message from Telegram chat ${telegramChatId}`);
        
        const payload = buildTelegramToDiscordMessage(message);
        const mediaInfo = getTelegramMediaInfo(message);

        if (mediaInfo) {
            console.log(`[Telegram Sync] ${mediaInfo.kind} detected - sending media with text`);
            let mediaBuffer = null;
            let fileExt = mediaInfo.extension;

            const fileInfo = await this._getTelegramFileInfo(mediaInfo.fileId);
            if (fileInfo?.url) {
                mediaBuffer = await this._downloadTelegramFile(fileInfo.url);
                const extFromFilePath = path.extname(String(fileInfo.filePath || '')).toLowerCase();
                if (extFromFilePath) {
                    fileExt = extFromFilePath;
                }
                if (mediaBuffer) {
                    console.log(`[Telegram Sync] Downloaded ${mediaInfo.kind} from Telegram (${mediaBuffer.length} bytes)`);
                }
            }

            console.log(`[Telegram Sync] Found ${matchingGuildIds.length} guild(s) to relay media to`);

            for (const guildId of matchingGuildIds) {
                const config = this.getGuildConfig(guildId);
                const channel = await this._getRelayChannel(guildId);
                if (!channel) {
                    continue;
                }

                try {
                    if (mediaBuffer) {
                        const attachment = new AttachmentBuilder(mediaBuffer, {
                            name: `telegram-${mediaInfo.kind}-${message.message_id}${fileExt || '.bin'}`
                        });
                        const sentMediaMessage = await this._sendDiscordMessage(channel, { files: [attachment] });

                        // Keep text under the media and tied to it by replying to the media message.
                        if (payload) {
                            await this._sendDiscordMessage(channel, {
                                content: payload,
                                reply: {
                                    messageReference: sentMediaMessage.id,
                                    failIfNotExists: false
                                },
                                allowedMentions: {
                                    repliedUser: false
                                }
                            });
                        }

                        console.log(`[Telegram Sync] ${mediaInfo.kind} sent to Discord channel ${config.discordChannelId} in guild ${guildId}`);
                    } else {
                        await this._sendDiscordMessage(channel, { content: payload || '📎 *[Media could not be downloaded from Telegram]*' });
                        console.log(`[Telegram Sync] Sent media download failure notice to Discord channel ${config.discordChannelId}`);
                    }
                } catch (error) {
                    console.error(`[Telegram Sync] Failed to send media to Discord channel ${config.discordChannelId}:`, error.message);
                }
            }
            return;
        }

        // If no media, send the text message as normal.
        if (!payload) {
            console.log(`[Telegram Sync] Message had no text/media content, skipping`);
            return;
        }

        console.log(`[Telegram Sync] Found ${matchingGuildIds.length} guild(s) to relay message to`);

        for (const guildId of matchingGuildIds) {
            const config = this.getGuildConfig(guildId);
            const channel = await this._getRelayChannel(guildId);
            if (!channel) {
                continue;
            }

            try {
                await this._sendDiscordMessage(channel, { content: payload });
                console.log(`[Telegram Sync] Message relayed to Discord channel ${config.discordChannelId} in guild ${guildId}`);
            } catch (error) {
                console.error(`[Telegram Sync] Failed to send to Discord channel ${config.discordChannelId}:`, error.message);
            }
        }
    }
}

module.exports = new TelegramSyncManager();