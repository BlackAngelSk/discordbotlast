const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'seasonLeaderboardConfig.json');

const GAMBLING_GAMES = [
    {
        key: 'blackjack',
        name: '🃏 Blackjack',
        color: 0xFF6B6B,
        hasTies: true
    },
    {
        key: 'roulette',
        name: '🎰 Roulette',
        color: 0xFF1744,
        hasTies: false
    },
    {
        key: 'slots',
        name: '🎰 Slots',
        color: 0xFFD700,
        hasTies: false
    },
    {
        key: 'dice',
        name: '🎲 Dice',
        color: 0x536DFE,
        hasTies: false
    },
    {
        key: 'coinflip',
        name: '🪙 Coinflip',
        color: 0xFFC107,
        hasTies: false
    },
    {
        key: 'rps',
        name: '🎮 Rock Paper Scissors',
        color: 0x4CAF50,
        hasTies: true
    },
    {
        key: 'ttt',
        name: '⭕ Tic Tac Toe',
        color: 0x2196F3,
        hasTies: true
    }
];

const DEFAULT_APPEARANCE = {
    headerTitle: '📊 {season} - Live Leaderboards',
    headerDescription: 'Updated every {interval} minutes • Total Players: {players}',
    headerColor: '#5865F2',
    balanceTitle: '💰 Season Balance Leaderboard',
    balanceColor: '#57F287',
    voiceTitle: '🎙️ Season Voice Channel Hours',
    voiceColor: '#9C27B0',
    layoutDensity: 'standard',
    customBlockTitle: '📝 Server Note',
    customBlockBody: '',
    showBalance: true,
    showVoice: true,
    showGambling: true,
    enabledGames: GAMBLING_GAMES.map((game) => game.key)
};

const normalizeHexColor = (value, fallback) => {
    const fallbackColor = String(fallback || '#5865F2').trim().toUpperCase();
    const normalized = String(value || '').trim();
    if (!normalized) return fallbackColor;
    const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return fallbackColor;
    return `#${hex.toUpperCase()}`;
};

const colorHexToNumber = (value, fallback) => {
    const hex = normalizeHexColor(value, fallback).slice(1);
    return parseInt(hex, 16);
};

const sanitizeText = (value, fallback, maxLength) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return String(fallback || '');
    return trimmed.slice(0, maxLength);
};

const applyTemplate = (template, context = {}) => {
    return String(template || '').replace(/\{(\w+)\}/g, (match, token) => {
        if (!Object.prototype.hasOwnProperty.call(context, token)) {
            return match;
        }
        return String(context[token] ?? '');
    });
};

class SeasonLeaderboardManager {
    constructor() {
        this.config = {};
        this.loaded = false;
        this.usernameCache = new Map(); // userId -> { username, expiresAt }
        this.usernameCacheTTL = 6 * 60 * 60 * 1000; // 6 hours
        this.pageCache = new Map(); // guildId -> { embeds, expiresAt, messageId, channelId }
    }

    async init() {
        try {
            const dataDir = path.dirname(CONFIG_FILE);
            await fs.mkdir(dataDir, { recursive: true });

            try {
                const data = await fs.readFile(CONFIG_FILE, 'utf8');
                const sanitized = data.replace(/^\uFEFF/, '').trim();
                const parsed = JSON.parse(sanitized || '{}');
                if (parsed && typeof parsed === 'object') {
                    this.config = parsed;
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error loading leaderboard config:', error);
                }
            }

            this.loaded = true;
            console.log('✅ Season Leaderboard Manager initialized');
        } catch (error) {
            console.error('Failed to initialize leaderboard manager:', error);
        }
    }

    async save() {
        try {
            await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Error saving leaderboard config:', error);
        }
    }

    getDefaultAppearance() {
        return {
            ...DEFAULT_APPEARANCE,
            enabledGames: [...DEFAULT_APPEARANCE.enabledGames]
        };
    }

    normalizeAppearance(appearance = {}) {
        const merged = {
            ...this.getDefaultAppearance(),
            ...(appearance || {})
        };

        const validGameKeys = new Set(GAMBLING_GAMES.map((game) => game.key));

        merged.headerTitle = sanitizeText(merged.headerTitle, DEFAULT_APPEARANCE.headerTitle, 256);
        merged.headerDescription = sanitizeText(merged.headerDescription, DEFAULT_APPEARANCE.headerDescription, 4096);
        merged.headerColor = normalizeHexColor(merged.headerColor, DEFAULT_APPEARANCE.headerColor);
        merged.balanceTitle = sanitizeText(merged.balanceTitle, DEFAULT_APPEARANCE.balanceTitle, 256);
        merged.balanceColor = normalizeHexColor(merged.balanceColor, DEFAULT_APPEARANCE.balanceColor);
        merged.voiceTitle = sanitizeText(merged.voiceTitle, DEFAULT_APPEARANCE.voiceTitle, 256);
        merged.voiceColor = normalizeHexColor(merged.voiceColor, DEFAULT_APPEARANCE.voiceColor);
        merged.layoutDensity = ['standard', 'compact', 'minimal'].includes(String(merged.layoutDensity || '').trim())
            ? String(merged.layoutDensity).trim()
            : DEFAULT_APPEARANCE.layoutDensity;
        merged.customBlockTitle = sanitizeText(merged.customBlockTitle, DEFAULT_APPEARANCE.customBlockTitle, 256);
        merged.customBlockBody = sanitizeText(merged.customBlockBody, DEFAULT_APPEARANCE.customBlockBody, 1024);
        merged.showBalance = merged.showBalance !== false;
        merged.showVoice = merged.showVoice !== false;
        merged.showGambling = merged.showGambling !== false;
        merged.enabledGames = Array.isArray(merged.enabledGames)
            ? Array.from(new Set(merged.enabledGames.map((key) => String(key || '').trim()).filter((key) => validGameKeys.has(key))))
            : [...DEFAULT_APPEARANCE.enabledGames];

        if (merged.enabledGames.length === 0) {
            merged.enabledGames = [...DEFAULT_APPEARANCE.enabledGames];
        }

        return merged;
    }

    getDefaultConfig() {
        return {
            enabled: true,
            updateIntervalMinutes: 15,
            compactMode: false,
            messageIds: [],
            allowedRoleId: null,
            indexMessageId: null,
            lastAutoUpdate: 0,
            pruneDays: 30,
            payouts: [10000, 5000, 2500],
            rewardRoles: [],
            messageId: null,
            channelId: null,
            appearance: this.getDefaultAppearance()
        };
    }

    normalizeConfig(config = {}) {
        const defaults = this.getDefaultConfig();
        const normalized = {
            ...defaults,
            ...(config || {})
        };

        normalized.enabled = normalized.enabled !== false;
        normalized.updateIntervalMinutes = Number.isFinite(Number(normalized.updateIntervalMinutes))
            ? Math.max(5, Math.floor(Number(normalized.updateIntervalMinutes)))
            : defaults.updateIntervalMinutes;
        normalized.compactMode = Boolean(normalized.compactMode);
        normalized.messageIds = Array.isArray(normalized.messageIds) ? normalized.messageIds : [];
        normalized.allowedRoleId = normalized.allowedRoleId || null;
        normalized.indexMessageId = normalized.indexMessageId || null;
        normalized.lastAutoUpdate = Number(normalized.lastAutoUpdate) || 0;
        normalized.lastManualUpdate = Number(normalized.lastManualUpdate) || 0;
        normalized.pruneDays = Number.isFinite(Number(normalized.pruneDays))
            ? Math.max(0, Math.floor(Number(normalized.pruneDays)))
            : defaults.pruneDays;
        normalized.payouts = Array.isArray(normalized.payouts)
            ? normalized.payouts.map((payout) => Math.max(0, Number(payout) || 0)).slice(0, 3)
            : [...defaults.payouts];
        while (normalized.payouts.length < 3) {
            normalized.payouts.push(0);
        }
        normalized.rewardRoles = Array.isArray(normalized.rewardRoles)
            ? normalized.rewardRoles.map((roleId) => String(roleId || '').trim()).filter(Boolean).slice(0, 3)
            : [];
        normalized.messageId = normalized.messageId || null;
        normalized.channelId = normalized.channelId || null;
        normalized.appearance = this.normalizeAppearance(normalized.appearance || {});

        return normalized;
    }

    buildConfigPreview(guildId, overrides = {}) {
        const current = this.getGuildConfig(guildId);
        return this.normalizeConfig({
            ...current,
            ...(overrides || {}),
            appearance: {
                ...(current.appearance || {}),
                ...((overrides && overrides.appearance) || {})
            }
        });
    }

    getGuildConfig(guildId) {
        if (!this.config[guildId]) {
            this.config[guildId] = this.getDefaultConfig();
        }

        this.config[guildId] = this.normalizeConfig(this.config[guildId]);
        return this.config[guildId];
    }

    /**
     * Set leaderboard channel for a guild
     * @param {string} guildId - Discord Guild ID
     * @param {string} channelId - Discord Channel ID
     * @returns {Object} Result
     */
    async setLeaderboardChannel(guildId, channelId) {
        const cfg = this.getGuildConfig(guildId);
        cfg.channelId = channelId;
        cfg.messageId = null; // Backward compatibility
        cfg.messageIds = []; // Reset message IDs
        cfg.indexMessageId = null; // Reset index message
        await this.save();
        return { success: true };
    }

    async setLeaderboardOptions(guildId, options = {}) {
        const cfg = this.getGuildConfig(guildId);
        if (typeof options.enabled === 'boolean') {
            cfg.enabled = options.enabled;
        }
        if (typeof options.updateIntervalMinutes === 'number' && options.updateIntervalMinutes >= 5) {
            cfg.updateIntervalMinutes = Math.floor(options.updateIntervalMinutes);
        }
        if (typeof options.compactMode === 'boolean') {
            cfg.compactMode = options.compactMode;
        }
        if (typeof options.pruneDays === 'number' && options.pruneDays >= 0) {
            cfg.pruneDays = Math.floor(options.pruneDays);
        }
        if (Array.isArray(options.payouts) && options.payouts.length > 0) {
            cfg.payouts = options.payouts.map((p) => Number(p) || 0).slice(0, 3);
        }
        if (Array.isArray(options.rewardRoles)) {
            cfg.rewardRoles = options.rewardRoles.slice(0, 3);
        }
        if (options.allowedRoleId !== undefined) {
            cfg.allowedRoleId = options.allowedRoleId || null;
        }
        if (options.appearance && typeof options.appearance === 'object') {
            cfg.appearance = this.normalizeAppearance({
                ...(cfg.appearance || {}),
                ...options.appearance
            });
        }
        await this.save();
    }

    /**
     * Get leaderboard channel for a guild
     * @param {string} guildId - Discord Guild ID
     * @returns {string|null} Channel ID
     */
    getLeaderboardChannel(guildId) {
        return this.config[guildId]?.channelId || null;
    }

    /**
     * Set the message ID for the leaderboard
     * @param {string} guildId - Discord Guild ID
     * @param {string} messageId - Discord Message ID
     */
    async setLeaderboardMessage(guildId, messageId) {
        const cfg = this.getGuildConfig(guildId);
        cfg.messageId = messageId;
        await this.save();
    }

    async setLeaderboardMessages(guildId, messageIds = []) {
        const cfg = this.getGuildConfig(guildId);
        cfg.messageIds = messageIds;
        if (messageIds.length > 0) {
            cfg.messageId = messageIds[0]; // Backward compatibility
        }
        await this.save();
    }

    async setIndexMessage(guildId, messageId) {
        const cfg = this.getGuildConfig(guildId);
        cfg.indexMessageId = messageId || null;
        await this.save();
    }

    /**
     * Get the message ID for the leaderboard
     * @param {string} guildId - Discord Guild ID
     * @returns {string|null} Message ID
     */
    getLeaderboardMessage(guildId) {
        return this.config[guildId]?.messageId || null;
    }

    getLeaderboardMessages(guildId) {
        return this.config[guildId]?.messageIds || [];
    }

    getIndexMessage(guildId) {
        return this.config[guildId]?.indexMessageId || null;
    }

    async findLeaderboardMessage(channel, guildId, messageId = null) {
        if (!channel?.isTextBased?.()) {
            return null;
        }

        const expectedPrefix = `lb_page:${guildId}:`;
        const botUserId = channel.client?.user?.id || null;

        if (messageId) {
            const cachedMessage = channel.messages?.cache?.get?.(messageId);
            if (cachedMessage) {
                return cachedMessage;
            }

            try {
                const fetchedMessage = await channel.messages.fetch(messageId);
                if (fetchedMessage) {
                    return fetchedMessage;
                }
            } catch {
                // Fall back to recent history scan below.
            }
        }

        try {
            const recentMessages = await channel.messages.fetch({ limit: 25 });
            const candidates = Array.from(recentMessages.values()).filter((message) => {
                if (botUserId && message.author?.id !== botUserId) {
                    return false;
                }

                const hasPager = message.components?.some((row) => row.components?.some((component) => String(component.customId || '').startsWith(expectedPrefix)));
                if (hasPager) {
                    return true;
                }

                const firstEmbed = Array.isArray(message.embeds) ? message.embeds[0] : null;
                const fields = Array.isArray(firstEmbed?.fields) ? firstEmbed.fields : [];
                const fieldNames = new Set(fields.map((field) => String(field?.name || '')));
                return fieldNames.has('🕐 Started') && fieldNames.has('📝 Status') && fieldNames.has('⏭️ Next Update');
            });

            return candidates[0] || null;
        } catch {
            return null;
        }
    }

    setPageCache(guildId, data) {
        if (!data) return;
        this.pageCache.set(guildId, {
            ...data,
            expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
        });
    }

    getPageCache(guildId) {
        const cached = this.pageCache.get(guildId);
        if (!cached) return null;
        if (cached.expiresAt < Date.now()) {
            this.pageCache.delete(guildId);
            return null;
        }
        return cached;
    }

    /**
     * Generate season leaderboard embeds
     * @param {string} guildId - Discord Guild ID
     * @param {Object} seasonManager - Season manager instance
     * @param {string} seasonName - Season name
     * @param {Client} client - Discord client for fetching usernames
     * @returns {Promise<Array>} Array of embeds
     */
    async generateSeasonEmbeds(guildId, seasonManager, seasonName, client, configOverride = null) {
        const season = seasonManager.getSeason(guildId, seasonName);
        if (!season) {
            return [];
        }

        const cfg = configOverride
            ? this.buildConfigPreview(guildId, configOverride)
            : this.getGuildConfig(guildId);
        const appearance = cfg.appearance || this.getDefaultAppearance();
        const updateIntervalMinutes = cfg.updateIntervalMinutes || 15;
        const compactMode = !!cfg.compactMode;
        const layoutDensity = appearance.layoutDensity || 'standard';
        const useCompactLimits = compactMode || layoutDensity === 'compact' || layoutDensity === 'minimal';
        const balanceLimit = layoutDensity === 'minimal' ? 3 : (useCompactLimits ? 3 : 10);
        const gamblingLimit = layoutDensity === 'minimal' ? 1 : (useCompactLimits ? 3 : 5);
        const nextUpdateAt = Math.floor((Date.now() + (updateIntervalMinutes * 60 * 1000)) / 1000);
        const context = {
            season: seasonName,
            players: season.totalPlayers || 0,
            interval: updateIntervalMinutes,
            started: new Date(season.startDate).toLocaleDateString(),
            status: season.isActive ? 'Active' : 'Ended'
        };
        const headerTitle = applyTemplate(appearance.headerTitle, context) || `📊 ${seasonName} - Live Leaderboards`;
        const headerDescription = applyTemplate(appearance.headerDescription, context)
            || `Updated every ${updateIntervalMinutes} minutes • Total Players: ${season.totalPlayers}`;
        const customBlockTitle = applyTemplate(appearance.customBlockTitle, context) || DEFAULT_APPEARANCE.customBlockTitle;
        const customBlockBody = applyTemplate(appearance.customBlockBody, context).trim();

        // Helper to get username with fallback
        const getUsername = async (userId, storedUsername) => {
            if (storedUsername && storedUsername !== 'Unknown User') {
                return storedUsername;
            }

            const cached = this.usernameCache.get(userId);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.username;
            }
            
            try {
                const user = await client.users.fetch(userId);
                const username = user.username;
                this.usernameCache.set(userId, { username, expiresAt: Date.now() + this.usernameCacheTTL });
                return username;
            } catch (error) {
                const fallback = `User${userId.slice(-4)}`;
                this.usernameCache.set(userId, { username: fallback, expiresAt: Date.now() + this.usernameCacheTTL });
                return fallback;
            }
        };

        const embeds = [];
        const combinedFields = [];
        const combinedTitle = headerTitle;
        const combinedDescription = headerDescription;

        // Header embed with season info
        const headerEmbed = new EmbedBuilder()
            .setColor(colorHexToNumber(appearance.headerColor, DEFAULT_APPEARANCE.headerColor))
            .setTitle(headerTitle)
            .setDescription(headerDescription)
            .addFields(
                { name: '🕐 Started', value: new Date(season.startDate).toLocaleDateString(), inline: true },
                { name: '📝 Status', value: season.isActive ? '🟢 Active' : '🔴 Ended', inline: true },
                { name: '⏭️ Next Update', value: `<t:${nextUpdateAt}:R>`, inline: true }
            )
            .setTimestamp();

        embeds.push(headerEmbed);

        combinedFields.push(
            { name: '🕐 Started', value: new Date(season.startDate).toLocaleDateString(), inline: true },
            { name: '📝 Status', value: season.isActive ? '🟢 Active' : '🔴 Ended', inline: true },
            { name: '⏭️ Next Update', value: `<t:${nextUpdateAt}:R>`, inline: true }
        );

        if (customBlockBody) {
            const customEmbed = new EmbedBuilder()
                .setColor(colorHexToNumber(appearance.headerColor, DEFAULT_APPEARANCE.headerColor))
                .setTitle(customBlockTitle)
                .setDescription(customBlockBody);

            embeds.push(customEmbed);

            combinedFields.push({
                name: customBlockTitle,
                value: customBlockBody,
                inline: false
            });
        }

        // Balance leaderboard
        const balanceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', balanceLimit);
        if (appearance.showBalance && balanceLeaderboard.length > 0) {
            let balanceDesc = '';
            for (let i = 0; i < balanceLeaderboard.length; i++) {
                const player = balanceLeaderboard[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const username = await getUsername(player.userId, player.username);
                balanceDesc += `${medal} **${username}** • **${player.balance.toLocaleString()}** coins\n`;
            }

            const balanceTitle = applyTemplate(appearance.balanceTitle, context) || DEFAULT_APPEARANCE.balanceTitle;

            const balanceEmbed = new EmbedBuilder()
                .setColor(colorHexToNumber(appearance.balanceColor, DEFAULT_APPEARANCE.balanceColor))
                .setTitle(balanceTitle)
                .setDescription(balanceDesc)
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' });

            embeds.push(balanceEmbed);

            combinedFields.push({
                name: balanceTitle,
                value: balanceDesc,
                inline: false
            });
        }

        // Voice Channel Hours leaderboard
        const voiceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'voiceHours', balanceLimit);
        // Filter to only show players with voice hours > 0
        const filteredVoiceLeaderboard = voiceLeaderboard.filter(player => (player.voiceHours || 0) > 0);
        
        if (appearance.showVoice && filteredVoiceLeaderboard.length > 0) {
            let voiceDesc = '';
            for (let i = 0; i < filteredVoiceLeaderboard.length; i++) {
                const player = filteredVoiceLeaderboard[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const username = await getUsername(player.userId, player.username);
                const hours = Math.floor(player.voiceHours || 0);
                const minutes = Math.round(((player.voiceHours || 0) - hours) * 60);
                voiceDesc += `${medal} **${username}** • **${hours}h ${minutes}m**\n`;
            }

            const voiceTitle = applyTemplate(appearance.voiceTitle, context) || DEFAULT_APPEARANCE.voiceTitle;

            const voiceEmbed = new EmbedBuilder()
                .setColor(colorHexToNumber(appearance.voiceColor, DEFAULT_APPEARANCE.voiceColor))
                .setTitle(voiceTitle)
                .setDescription(voiceDesc)
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' });

            embeds.push(voiceEmbed);

            combinedFields.push({
                name: voiceTitle,
                value: voiceDesc,
                inline: false
            });
        }

        // Gambling leaderboards
        const enabledGames = new Set(appearance.enabledGames || DEFAULT_APPEARANCE.enabledGames);
        for (const game of GAMBLING_GAMES) {
            if (!appearance.showGambling || !enabledGames.has(game.key)) {
                continue;
            }

            const winsLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'wins', 5);
            const winRateLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'winRate', 5);
            const totalGamesLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'total', 5);

            if (layoutDensity === 'compact' || layoutDensity === 'minimal') {
                const compactLines = [];
                const topWins = winsLeaderboard[0];
                const topRate = winRateLeaderboard[0];
                const topGames = totalGamesLeaderboard[0];

                if (topWins) {
                    const username = await getUsername(topWins.userId, topWins.username);
                    compactLines.push(`Wins: **${username}** (${topWins.wins})`);
                }

                if (topRate) {
                    const username = await getUsername(topRate.userId, topRate.username);
                    compactLines.push(`Rate: **${username}** (${topRate.winRate}%)`);
                }

                if (layoutDensity === 'compact' && topGames) {
                    const username = await getUsername(topGames.userId, topGames.username);
                    compactLines.push(`Games: **${username}** (${topGames.total})`);
                }

                if (compactLines.length > 0) {
                    combinedFields.push({
                        name: game.name,
                        value: compactLines.join('\n'),
                        inline: layoutDensity !== 'minimal'
                    });
                }

                continue;
            }

            // Wins leaderboard
            const winsLimit = gamblingLimit;
            const winRateLimit = gamblingLimit;
            const totalLimit = gamblingLimit;
            const winsLeaderboardLimited = winsLeaderboard.slice(0, winsLimit);
            if (winsLeaderboardLimited.length > 0) {
                let winsDesc = '';
                for (let i = 0; i < winsLeaderboardLimited.length; i++) {
                    const player = winsLeaderboardLimited[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const winRate = player.total > 0 ? ((player.wins / player.total) * 100).toFixed(1) : 0;
                    const username = await getUsername(player.userId, player.username);
                    winsDesc += `${medal} **${username}** • **${player.wins}** wins (${winRate}%)\n`;
                }

                const winsEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Most Wins`)
                    .setDescription(winsDesc)
                    .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 5 Players' });

                embeds.push(winsEmbed);

                combinedFields.push({
                    name: `${game.name} - Most Wins`,
                    value: winsDesc,
                    inline: false
                });
            }

            // Win Rate leaderboard
            const winRateLeaderboardLimited = winRateLeaderboard.slice(0, winRateLimit);
            if (winRateLeaderboardLimited.length > 0) {
                let winRateDesc = '';
                for (let i = 0; i < winRateLeaderboardLimited.length; i++) {
                    const player = winRateLeaderboardLimited[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const username = await getUsername(player.userId, player.username);
                    winRateDesc += `${medal} **${username}** • **${player.winRate}%** win rate (${player.wins}W/${player.losses}L)\n`;
                }

                const winRateEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Best Win Rate`)
                    .setDescription(winRateDesc)
                    .setFooter({ text: compactMode ? 'Top 3 Players (min 5 games)' : 'Top 5 Players (min 5 games)' });

                embeds.push(winRateEmbed);

                combinedFields.push({
                    name: `${game.name} - Best Win Rate`,
                    value: winRateDesc,
                    inline: false
                });
            }

            // Total Games leaderboard
            const totalGamesLeaderboardLimited = totalGamesLeaderboard.slice(0, totalLimit);
            if (totalGamesLeaderboardLimited.length > 0) {
                let totalDesc = '';
                for (let i = 0; i < totalGamesLeaderboardLimited.length; i++) {
                    const player = totalGamesLeaderboardLimited[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const winRate = player.total > 0 ? ((player.wins / player.total) * 100).toFixed(1) : 0;
                    const username = await getUsername(player.userId, player.username);
                    totalDesc += `${medal} **${username}** • **${player.total}** games (${player.wins}W/${player.losses}L - ${winRate}%)\n`;
                }

                const totalEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Most Games Played`)
                    .setDescription(totalDesc)
                    .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 5 Players' });

                embeds.push(totalEmbed);

                combinedFields.push({
                    name: `${game.name} - Most Games Played`,
                    value: totalDesc,
                    inline: false
                });
            }
        }

        const combinedEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(combinedTitle)
            .setDescription(combinedDescription)
            .setTimestamp();

        const isCombinedWithinLimits = (fields) => {
            if (fields.length > 25) return false;
            let total = (combinedTitle?.length || 0) + (combinedDescription?.length || 0);
            for (const field of fields) {
                if (!field?.name || !field?.value) return false;
                if (field.name.length > 256 || field.value.length > 1024) return false;
                total += field.name.length + field.value.length;
            }
            return total <= 6000;
        };

        if (isCombinedWithinLimits(combinedFields)) {
            combinedEmbed.addFields(combinedFields);
            return [combinedEmbed];
        }

        return embeds;
    }

    async generateSeasonSummaryEmbed(guildId, seasonManager, seasonName) {
        const season = seasonManager.getSeason(guildId, seasonName);
        if (!season) return null;

        const cfg = this.getGuildConfig(guildId);
        const winners = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', 3);
        let winnersDesc = '';
        for (let i = 0; i < winners.length; i++) {
            const player = winners[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            const payout = cfg.payouts?.[i] ? ` • Payout: **${cfg.payouts[i].toLocaleString()}** coins` : '';
            winnersDesc += `${medal} <@${player.userId}> • **${player.balance.toLocaleString()}** coins${payout}\n`;
        }

        if (!winnersDesc) {
            winnersDesc = 'No winners available.';
        }

        const totalPlayers = season.totalPlayers || 0;
        const summaryEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`🏁 ${seasonName.toUpperCase()} - Season End Summary`)
            .setDescription('The season has ended. Here are the final results!')
            .addFields(
                { name: '👥 Total Players', value: `${totalPlayers}`, inline: true },
                { name: '🕐 Started', value: new Date(season.startDate).toLocaleDateString(), inline: true },
                { name: '🧾 Ended', value: season.endDate ? new Date(season.endDate).toLocaleDateString() : 'N/A', inline: true },
                { name: '🏆 Winners (Balance)', value: winnersDesc, inline: false }
            )
            .setTimestamp();

        return summaryEmbed;
    }

    /**
     * Get gambling leaderboard sorted by specific type
     * @param {Object} leaderboard - Season leaderboard object
     * @param {string} gameKey - Game key (blackjack, roulette, etc.)
     * @param {string} sortBy - Sort type: 'wins', 'winRate', 'total'
     * @param {number} limit - Number of top players to return
     * @returns {Array} Leaderboard entries
     */
    getGamblingLeaderboardByType(leaderboard, gameKey, sortBy = 'wins', limit = 5) {
        if (!leaderboard || typeof leaderboard !== 'object') {
            return [];
        }

        const players = [];

        for (const userId in leaderboard) {
            const player = leaderboard[userId];
            if (player.gambling && player.gambling[gameKey]) {
                const stats = player.gambling[gameKey];
                const hasTies = ['blackjack', 'rps', 'ttt'].includes(gameKey);
                const wins = Number(stats.wins) || 0;
                const losses = Number(stats.losses) || 0;
                const ties = Number(stats.ties) || 0;
                const total = hasTies 
                    ? wins + losses + ties
                    : wins + losses;

                if (total > 0) {
                    const winRate = ((wins / total) * 100).toFixed(1);
                    players.push({
                        userId,
                        wins,
                        losses,
                        ties,
                        total: total,
                        winRate: parseFloat(winRate)
                    });
                }
            }
        }

        // Sort based on type
        if (sortBy === 'winRate') {
            players.sort((a, b) => b.winRate - a.winRate);
        } else if (sortBy === 'total') {
            players.sort((a, b) => b.total - a.total);
        } else {
            // Default: sort by wins
            players.sort((a, b) => b.wins - a.wins);
        }

        return players.slice(0, limit);
    }
}

const seasonLeaderboardManager = new SeasonLeaderboardManager();

module.exports = seasonLeaderboardManager;
module.exports.SEASON_LEADERBOARD_GAMES = GAMBLING_GAMES.map((game) => ({
    key: game.key,
    name: game.name
}));
