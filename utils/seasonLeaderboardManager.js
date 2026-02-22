const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'seasonLeaderboardConfig.json');

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
                this.config = JSON.parse(data);
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

    getGuildConfig(guildId) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }

        const cfg = this.config[guildId];
        if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;
        if (!cfg.updateIntervalMinutes) cfg.updateIntervalMinutes = 15;
        if (typeof cfg.compactMode !== 'boolean') cfg.compactMode = false;
        if (!Array.isArray(cfg.messageIds)) cfg.messageIds = [];
        if (!cfg.allowedRoleId) cfg.allowedRoleId = null;
        if (!cfg.indexMessageId) cfg.indexMessageId = null;
        if (!cfg.lastAutoUpdate) cfg.lastAutoUpdate = 0;
        if (!cfg.pruneDays) cfg.pruneDays = 30;
        if (!Array.isArray(cfg.payouts)) cfg.payouts = [10000, 5000, 2500];
        if (!Array.isArray(cfg.rewardRoles)) cfg.rewardRoles = [];
        return cfg;
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
        cfg.messageId = messageIds[0] || null; // Backward compatibility
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
    async generateSeasonEmbeds(guildId, seasonManager, seasonName, client) {
        const season = seasonManager.getSeason(guildId, seasonName);
        if (!season) {
            return [];
        }

        const cfg = this.getGuildConfig(guildId);
        const updateIntervalMinutes = cfg.updateIntervalMinutes || 15;
        const compactMode = !!cfg.compactMode;
        const balanceLimit = compactMode ? 3 : 10;
        const gamblingLimit = compactMode ? 3 : 5;
        const nextUpdateAt = Math.floor((Date.now() + (updateIntervalMinutes * 60 * 1000)) / 1000);

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
        const combinedTitle = `📊 ${seasonName.toUpperCase()} - Live Leaderboards`;
        const combinedDescription = `Updated every ${updateIntervalMinutes} minutes • Total Players: ${season.totalPlayers}`;

        // Header embed with season info
        const headerEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${seasonName.toUpperCase()} - Live Leaderboards`)
            .setDescription(`Updated every ${updateIntervalMinutes} minutes • Total Players: ${season.totalPlayers}`)
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

        // Balance leaderboard
        const balanceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', balanceLimit);
        if (balanceLeaderboard.length > 0) {
            let balanceDesc = '';
            for (let i = 0; i < balanceLeaderboard.length; i++) {
                const player = balanceLeaderboard[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const username = await getUsername(player.userId, player.username);
                balanceDesc += `${medal} **${username}** • **${player.balance.toLocaleString()}** coins\n`;
            }

            const balanceEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('💰 Season Balance Leaderboard')
                .setDescription(balanceDesc)
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' });

            embeds.push(balanceEmbed);

            combinedFields.push({
                name: '💰 Season Balance Leaderboard',
                value: balanceDesc,
                inline: false
            });
        }

        // Voice Channel Hours leaderboard
        const voiceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'voiceHours', balanceLimit);
        // Filter to only show players with voice hours > 0
        const filteredVoiceLeaderboard = voiceLeaderboard.filter(player => (player.voiceHours || 0) > 0);
        
        if (filteredVoiceLeaderboard.length > 0) {
            let voiceDesc = '';
            for (let i = 0; i < filteredVoiceLeaderboard.length; i++) {
                const player = filteredVoiceLeaderboard[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const username = await getUsername(player.userId, player.username);
                const hours = Math.floor(player.voiceHours || 0);
                const minutes = Math.round(((player.voiceHours || 0) - hours) * 60);
                voiceDesc += `${medal} **${username}** • **${hours}h ${minutes}m**\n`;
            }

            const voiceEmbed = new EmbedBuilder()
                .setColor(0x9C27B0)
                .setTitle('🎙️ Season Voice Channel Hours')
                .setDescription(voiceDesc)
                .setFooter({ text: compactMode ? 'Top 3 Players' : 'Top 10 Players' });

            embeds.push(voiceEmbed);

            combinedFields.push({
                name: '🎙️ Season Voice Channel Hours',
                value: voiceDesc,
                inline: false
            });
        }

        // Gambling leaderboards
        const gamblingGames = [
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

        for (const game of gamblingGames) {
            // Wins leaderboard
            const winsLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'wins', 5);
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
            const winRateLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'winRate', 5);
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
            const totalGamesLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'total', 5);
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
        const players = [];

        for (const userId in leaderboard) {
            const player = leaderboard[userId];
            if (player.gambling && player.gambling[gameKey]) {
                const stats = player.gambling[gameKey];
                const hasTies = ['blackjack', 'rps', 'ttt'].includes(gameKey);
                const total = hasTies 
                    ? stats.wins + stats.losses + (stats.ties || 0)
                    : stats.wins + stats.losses;

                if (total > 0) {
                    const winRate = ((stats.wins / total) * 100).toFixed(1);
                    players.push({
                        userId,
                        wins: stats.wins,
                        losses: stats.losses,
                        ties: stats.ties || 0,
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

module.exports = new SeasonLeaderboardManager();
