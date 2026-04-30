/**
 * Live Alerts Manager
 * Polls Twitch & YouTube Data API periodically and posts to configured channels.
 * Twitch: Uses Helix API (requires CLIENT_ID + APP_ACCESS_TOKEN)
 * YouTube: Uses Data API v3 (requires YOUTUBE_API_KEY) for new video uploads
 */
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'liveAlerts.json');

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

function httpsRequest(url, { method = 'GET', headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : null;
        const requestHeaders = { ...headers };

        if (payload && !requestHeaders['Content-Length']) {
            requestHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request(url, { method, headers: requestHeaders, timeout: 8000 }, res => {
            let data = '';
            res.on('data', c => (data += c));
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

        if (payload) req.write(payload);
        req.end();
    });
}

function httpsGet(url, headers = {}) {
    return httpsRequest(url, { method: 'GET', headers });
}

function normalizeYouTubeChannelIdentifier(input) {
    const value = String(input || '').trim();
    if (!value) return value;

    // Accept direct UC channel IDs anywhere in the string (raw value or URL).
    const match = value.match(/(UC[\w-]{22})/);
    return match ? match[1] : value;
}

class LiveAlertsManager {
    constructor() {
        // data: { guildId: { twitch: [{ username, channelId, roleId?, lastLive }], youtube: [{ channelId, discordChannelId, roleId?, lastVideoId }] } }
        this.data = {};
        this._twitchToken = null;
        this._twitchTokenExpiry = 0;
        this._interval = null;
        this._warnedMissingTwitchCredentials = false;
        this._warnedTwitchAuthFailure = false;
    }

    async init(client) {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
        this._client = client;
        this._startPolling();
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    // ── Config methods ────────────────────────────────────────────────────────
    async addTwitchAlert(guildId, twitchUsername, discordChannelId, roleId = null) {
        if (!this.data[guildId]) this.data[guildId] = { twitch: [], youtube: [] };
        const existing = this.data[guildId].twitch.find(e => e.username.toLowerCase() === twitchUsername.toLowerCase());
        if (existing) { existing.channelId = discordChannelId; existing.roleId = roleId; }
        else this.data[guildId].twitch.push({ username: twitchUsername.toLowerCase(), channelId: discordChannelId, roleId, lastLive: false });
        await this.save();
        setTimeout(() => this._pollGuild(guildId).catch(() => {}), 1500);
    }

    async removeTwitchAlert(guildId, twitchUsername) {
        if (!this.data[guildId]) return;
        this.data[guildId].twitch = this.data[guildId].twitch.filter(e => e.username !== twitchUsername.toLowerCase());
        await this.save();
    }

    async addYouTubeAlert(guildId, ytChannelId, discordChannelId, roleId = null) {
        if (!this.data[guildId]) this.data[guildId] = { twitch: [], youtube: [] };
        const normalizedChannelId = normalizeYouTubeChannelIdentifier(ytChannelId);
        const existing = this.data[guildId].youtube.find(e => e.channelId === normalizedChannelId);
        if (existing) { existing.discordChannelId = discordChannelId; existing.roleId = roleId; }
        else this.data[guildId].youtube.push({ channelId: normalizedChannelId, discordChannelId, roleId, lastVideoId: null });
        await this.save();
        setTimeout(() => this._pollGuild(guildId).catch(() => {}), 1500);
    }

    async removeYouTubeAlert(guildId, ytChannelId) {
        if (!this.data[guildId]) return;
        const normalizedChannelId = normalizeYouTubeChannelIdentifier(ytChannelId);
        this.data[guildId].youtube = this.data[guildId].youtube.filter(e => e.channelId !== normalizedChannelId);
        await this.save();
    }

    getAlerts(guildId) {
        return this.data[guildId] || { twitch: [], youtube: [] };
    }

    // ── Twitch ────────────────────────────────────────────────────────────────
    async _getTwitchToken() {
        if (this._twitchToken && Date.now() < this._twitchTokenExpiry) return this._twitchToken;

        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            if (!this._warnedMissingTwitchCredentials) {
                console.warn('Twitch live alerts are disabled: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are missing.');
                this._warnedMissingTwitchCredentials = true;
            }
            return null;
        }

        try {
            const body = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials'
            }).toString();

            const res = await httpsRequest('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });

            if (res.body?.access_token) {
                this._twitchToken = res.body.access_token;
                this._twitchTokenExpiry = Date.now() + ((res.body.expires_in || 3600) - 60) * 1000;
                this._warnedTwitchAuthFailure = false;
                return this._twitchToken;
            }

            if (!this._warnedTwitchAuthFailure) {
                console.error('Twitch token request failed:', res.body?.message || `HTTP ${res.status}`);
                this._warnedTwitchAuthFailure = true;
            }
        } catch (err) {
            console.error('Twitch token error:', err.message);
        }
        return null;
    }

    async _checkTwitch(entry, guildId) {
        const token = await this._getTwitchToken();
        if (!token) return;
        const clientId = process.env.TWITCH_CLIENT_ID;
        try {
            const res = await httpsGet(
                `https://api.twitch.tv/helix/streams?user_login=${entry.username}`,
                { 'Client-ID': clientId, 'Authorization': `Bearer ${token}` }
            );
            const stream = res.body?.data?.[0];
            const isLive = !!stream;

            if (isLive && !entry.lastLive) {
                entry.lastLive = true;
                await this.save();
                await this._postTwitchAlert(guildId, entry, stream);
            } else if (!isLive && entry.lastLive) {
                entry.lastLive = false;
                await this.save();
            }
        } catch (err) {
            console.error(`Twitch check error (${entry.username}):`, err.message);
        }
    }

    async _postTwitchAlert(guildId, entry, stream) {
        if (!this._client) return;
        const channel = this._client.channels.cache.get(entry.channelId);
        if (!channel) return;
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle(`🔴 ${stream.user_name} is now live on Twitch!`)
            .setURL(`https://twitch.tv/${entry.username}`)
            .setDescription(stream.title || 'No title')
            .addFields(
                { name: '🎮 Game', value: stream.game_name || 'Unknown', inline: true },
                { name: '👥 Viewers', value: stream.viewer_count?.toString() || '0', inline: true },
            )
            .setThumbnail(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${entry.username}-320x180.jpg`)
            .setTimestamp();
        const mention = entry.roleId ? `<@&${entry.roleId}> ` : '';
        await channel.send({ content: `${mention}🔴 **${stream.user_name}** is live!`, embeds: [embed] }).catch(() => {});
    }

    // ── YouTube ───────────────────────────────────────────────────────────────
    async _checkYouTube(entry, guildId) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return;
        try {
            // Read the latest uploaded video from this channel.
            const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${encodeURIComponent(entry.channelId)}&part=snippet,id&order=date&maxResults=1&type=video`;
            const res = await httpsGet(url);
            if (res.status >= 400 || res.body?.error) {
                const errMessage = res.body?.error?.message || `HTTP ${res.status}`;
                console.error(`YouTube check error (${entry.channelId}):`, errMessage);
                return;
            }
            const item = res.body?.items?.[0];
            if (!item) return;
            const videoId = item.id?.videoId;
            if (!videoId) return;

            // First successful fetch seeds state so old uploads do not trigger alerts.
            if (!entry.lastVideoId) {
                entry.lastVideoId = videoId;
                await this.save();
                return;
            }

            if (videoId === entry.lastVideoId) return;
            entry.lastVideoId = videoId;
            await this.save();
            await this._postYouTubeAlert(guildId, entry, item);
        } catch (err) {
            console.error(`YouTube check error (${entry.channelId}):`, err.message);
        }
    }

    async _postYouTubeAlert(guildId, entry, item) {
        if (!this._client) return;
        const channel = this._client.channels.cache.get(entry.discordChannelId);
        if (!channel) return;
        const { EmbedBuilder } = require('discord.js');
        const title = item.snippet?.title || 'New Video';
        const channelTitle = item.snippet?.channelTitle || 'YouTube Channel';
        const videoId = item.id?.videoId;
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`▶️ ${channelTitle} uploaded a new video!`)
            .setURL(`https://youtube.com/watch?v=${videoId}`)
            .setDescription(title)
            .setThumbnail(item.snippet?.thumbnails?.medium?.url || null)
            .setTimestamp();
        const mention = entry.roleId ? `<@&${entry.roleId}> ` : '';
        await channel.send({ content: `${mention}▶️ **${channelTitle}** uploaded a new video!`, embeds: [embed] }).catch(() => {});
    }

    // ── Polling ───────────────────────────────────────────────────────────────
    _startPolling() {
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => this._poll(), POLL_INTERVAL);
        setTimeout(() => this._poll(), 10000);
    }

    async _pollGuild(guildId) {
        const config = this.data[guildId];
        if (!config) return;

        for (const entry of (config.twitch || [])) {
            await this._checkTwitch(entry, guildId);
        }
        for (const entry of (config.youtube || [])) {
            await this._checkYouTube(entry, guildId);
        }
    }

    async _poll() {
        for (const guildId of Object.keys(this.data)) {
            await this._pollGuild(guildId);
        }
    }
}

module.exports = new LiveAlertsManager();
