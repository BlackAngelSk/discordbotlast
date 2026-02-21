const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'seasonLeaderboardConfig.json');

class SeasonLeaderboardManager {
    constructor() {
        this.config = {};
        this.loaded = false;
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

    /**
     * Set leaderboard channel for a guild
     * @param {string} guildId - Discord Guild ID
     * @param {string} channelId - Discord Channel ID
     * @returns {Object} Result
     */
    async setLeaderboardChannel(guildId, channelId) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        this.config[guildId].channelId = channelId;
        this.config[guildId].messageId = null; // Reset message ID
        await this.save();
        return { success: true };
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
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        this.config[guildId].messageId = messageId;
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

        // Helper to get username with fallback
        const getUsername = async (userId, storedUsername) => {
            if (storedUsername && storedUsername !== 'Unknown User') {
                return storedUsername;
            }
            
            try {
                const user = await client.users.fetch(userId);
                return user.username;
            } catch (error) {
                return `User${userId.slice(-4)}`;
            }
        };

        const embeds = [];

        // Header embed with season info
        const headerEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${seasonName.toUpperCase()} - Live Leaderboards`)
            .setDescription(`Updated every 15 minutes • Total Players: ${season.totalPlayers}`)
            .addFields(
                { name: '🕐 Started', value: new Date(season.startDate).toLocaleDateString(), inline: true },
                { name: '📝 Status', value: season.isActive ? '🟢 Active' : '🔴 Ended', inline: true }
            )
            .setTimestamp();

        embeds.push(headerEmbed);

        // Balance leaderboard
        const balanceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', 10);
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
                .setFooter({ text: 'Top 10 Players' });

            embeds.push(balanceEmbed);
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
            if (winsLeaderboard.length > 0) {
                let winsDesc = '';
                for (let i = 0; i < winsLeaderboard.length; i++) {
                    const player = winsLeaderboard[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const winRate = player.total > 0 ? ((player.wins / player.total) * 100).toFixed(1) : 0;
                    const username = await getUsername(player.userId, player.username);
                    winsDesc += `${medal} **${username}** • **${player.wins}** wins (${winRate}%)\n`;
                }

                const winsEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Most Wins`)
                    .setDescription(winsDesc)
                    .setFooter({ text: 'Top 5 Players' });

                embeds.push(winsEmbed);
            }

            // Win Rate leaderboard
            const winRateLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'winRate', 5);
            if (winRateLeaderboard.length > 0) {
                let winRateDesc = '';
                for (let i = 0; i < winRateLeaderboard.length; i++) {
                    const player = winRateLeaderboard[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const username = await getUsername(player.userId, player.username);
                    winRateDesc += `${medal} **${username}** • **${player.winRate}%** win rate (${player.wins}W/${player.losses}L)\n`;
                }

                const winRateEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Best Win Rate`)
                    .setDescription(winRateDesc)
                    .setFooter({ text: 'Top 5 Players (min 5 games)' });

                embeds.push(winRateEmbed);
            }

            // Total Games leaderboard
            const totalGamesLeaderboard = this.getGamblingLeaderboardByType(season.leaderboard, game.key, 'total', 5);
            if (totalGamesLeaderboard.length > 0) {
                let totalDesc = '';
                for (let i = 0; i < totalGamesLeaderboard.length; i++) {
                    const player = totalGamesLeaderboard[i];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const winRate = player.total > 0 ? ((player.wins / player.total) * 100).toFixed(1) : 0;
                    const username = await getUsername(player.userId, player.username);
                    totalDesc += `${medal} **${username}** • **${player.total}** games (${player.wins}W/${player.losses}L - ${winRate}%)\n`;
                }

                const totalEmbed = new EmbedBuilder()
                    .setColor(game.color)
                    .setTitle(`${game.name} - Most Games Played`)
                    .setDescription(totalDesc)
                    .setFooter({ text: 'Top 5 Players' });

                embeds.push(totalEmbed);
            }
        }

        return embeds;
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
