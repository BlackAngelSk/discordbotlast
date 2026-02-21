/**
 * Season Manager for Economy/Leaderboard
 * Manages seasonal economy resets and leaderboards
 */

const fs = require('fs').promises;
const path = require('path');
const databaseManager = require('./databaseManager');

class SeasonManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'seasons.json');
        this.data = {
            seasons: {},
            currentSeason: null
        };
        this.loaded = false;
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            try {
                const fileData = await fs.readFile(this.dataPath, 'utf8');
                this.data = JSON.parse(fileData);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error loading seasons:', error);
                }
            }

            this.loaded = true;
            console.log('✅ Season manager initialized');
        } catch (error) {
            console.error('Failed to initialize season manager:', error);
        }
    }

    /**
     * Migrate leaderboards to add missing usernames
     * @param {Object} client - Discord client to fetch usernames
     */
    async migrateUsernames(client) {
        let updated = 0;
        for (const guildId in this.data.seasons) {
            for (const seasonName in this.data.seasons[guildId]) {
                const season = this.data.seasons[guildId][seasonName];
                if (!season.leaderboard) continue;

                for (const userId in season.leaderboard) {
                    const player = season.leaderboard[userId];
                    if (!player.username || player.username === 'Unknown User') {
                        try {
                            const user = await client.users.fetch(userId);
                            player.username = user.username;
                            updated++;
                        } catch (error) {
                            player.username = `User${userId.slice(-4)}`;
                        }
                    }
                }
            }
        }
        if (updated > 0) {
            await this.save();
            console.log(`✅ Migrated ${updated} player username(s) in seasons`);
        }
        return updated;
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));

            // Also save to MongoDB if available
            if (databaseManager.useDB === 'mongodb') {
                const seasonsCollection = databaseManager.db.collection('seasons');
                await seasonsCollection.updateOne(
                    { _id: 'config' },
                    { $set: this.data },
                    { upsert: true }
                );
            }
        } catch (error) {
            console.error('Error saving seasons:', error);
        }
    }

    /**
     * Create a new season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name (e.g., "season-development")
     * @param {string} adminId - Creator admin ID
     * @returns {Object} Season data
     */
    async createSeason(guildId, seasonName, adminId) {
        if (!this.data.seasons[guildId]) {
            this.data.seasons[guildId] = {};
        }

        // Check if season already exists
        if (this.data.seasons[guildId][seasonName]) {
            return { success: false, error: 'Season already exists' };
        }

        const seasonData = {
            name: seasonName,
            guildId,
            createdAt: Date.now(),
            createdBy: adminId,
            startDate: new Date().toISOString(),
            endDate: null,
            isActive: true,
            leaderboard: {}, // userId -> { balance, xp, level, coins }
            totalPlayers: 0,
            archived: false
        };

        this.data.seasons[guildId][seasonName] = seasonData;

        // Set as current season for the guild
        if (!this.data.currentSeason) {
            this.data.currentSeason = {};
        }
        this.data.currentSeason[guildId] = seasonName;

        await this.save();

        return {
            success: true,
            season: seasonData
        };
    }

    /**
     * Get current season for guild
     * @param {string} guildId - Discord Guild ID
     * @returns {string|null} Current season name
     */
    getCurrentSeason(guildId) {
        return this.data.currentSeason?.[guildId] || null;
    }

    /**
     * Get all seasons for a guild
     * @param {string} guildId - Discord Guild ID
     * @returns {Object} All seasons for guild
     */
    getGuildSeasons(guildId) {
        return this.data.seasons[guildId] || {};
    }

    /**
     * Get specific season data
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @returns {Object|null} Season data
     */
    getSeason(guildId, seasonName) {
        return this.data.seasons?.[guildId]?.[seasonName] || null;
    }

    /**
     * Record player progress in season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {string} userId - Discord User ID
     * @param {Object} stats - Player stats {balance, xp, level, seasonalCoins, gambling}
     */
    async recordPlayerStats(guildId, seasonName, userId, stats) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found' };
        }

        season.leaderboard[userId] = {
            userId,
            username: stats.username || 'Unknown User',
            balance: stats.balance || 0,
            xp: stats.xp || 0,
            level: stats.level || 1,
            coins: stats.seasonalCoins || 0,
            gambling: stats.gambling || {
                blackjack: { wins: 0, losses: 0, ties: 0 },
                roulette: { wins: 0, losses: 0 },
                slots: { wins: 0, losses: 0 },
                dice: { wins: 0, losses: 0 },
                coinflip: { wins: 0, losses: 0 },
                rps: { wins: 0, losses: 0, ties: 0 },
                ttt: { wins: 0, losses: 0, ties: 0 }
            },
            lastUpdated: Date.now()
        };

        season.totalPlayers = Object.keys(season.leaderboard).length;

        await this.save();
        return { success: true };
    }

    /**
     * Get season leaderboard
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {string} sortBy - Sort by: 'balance', 'xp', 'level', 'coins'
     * @param {number} limit - Limit results
     * @returns {Array} Leaderboard entries
     */
    getSeasonLeaderboard(guildId, seasonName, sortBy = 'coins', limit = 10) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return [];
        }

        return Object.values(season.leaderboard)
            .sort((a, b) => b[sortBy] - a[sortBy])
            .slice(0, limit);
    }

    /**
     * End a season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @returns {Object} Result
     */
    async endSeason(guildId, seasonName) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found' };
        }

        season.isActive = false;
        season.endDate = new Date().toISOString();
        season.archived = true;

        await this.save();
        return { success: true };
    }

    /**
     * Archive season and reset guild economy
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @returns {Object} Result
     */
    async archiveSeason(guildId, seasonName) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found' };
        }

        await this.endSeason(guildId, seasonName);

        // Clear current season
        delete this.data.currentSeason[guildId];

        await this.save();
        return { success: true, season };
    }

    /**
     * Get season summary/stats
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @returns {Object} Season summary
     */
    getSeasonSummary(guildId, seasonName) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return null;
        }

        const leaderboard = Object.values(season.leaderboard);
        const totalBalance = leaderboard.reduce((sum, p) => sum + (p.balance || 0), 0);
        const totalXP = leaderboard.reduce((sum, p) => sum + (p.xp || 0), 0);
        const totalCoins = leaderboard.reduce((sum, p) => sum + (p.coins || 0), 0);

        return {
            name: season.name,
            isActive: season.isActive,
            startDate: season.startDate,
            endDate: season.endDate,
            totalPlayers: season.totalPlayers,
            totalBalance,
            totalXP,
            totalCoins,
            createdBy: season.createdBy,
            createdAt: new Date(season.createdAt).toLocaleString()
        };
    }

    /**
     * List all seasons for a guild
     * @param {string} guildId - Discord Guild ID
     * @returns {Array} List of seasons
     */
    listSeasons(guildId) {
        const seasons = this.getGuildSeasons(guildId);
        return Object.entries(seasons).map(([name, data]) => ({
            name,
            isActive: data.isActive,
            startDate: data.startDate,
            totalPlayers: data.totalPlayers,
            archived: data.archived
        }));
    }

    /**
     * Auto-enroll a user in all active seasons for a guild
     * @param {string} guildId - Discord Guild ID
     * @param {string} userId - Discord User ID
     * @param {Object} stats - Player stats {balance, xp, level, seasonalCoins, gambling}
     * @returns {Array} List of seasons user was enrolled in
     */
    async autoEnrollUserInSeasons(guildId, userId, stats = {}) {
        const seasons = this.getGuildSeasons(guildId);
        const enrolledSeasons = [];

        for (const [seasonName, season] of Object.entries(seasons)) {
            // Only enroll in active seasons
            if (season.isActive && !season.leaderboard[userId]) {
                season.leaderboard[userId] = {
                    userId,
                    username: stats.username || 'Unknown User',
                    balance: stats.balance || 0,
                    xp: stats.xp || 0,
                    level: stats.level || 1,
                    coins: stats.seasonalCoins || 0,
                    gambling: stats.gambling || {
                        blackjack: { wins: 0, losses: 0, ties: 0 },
                        roulette: { wins: 0, losses: 0 },
                        slots: { wins: 0, losses: 0 },
                        dice: { wins: 0, losses: 0 },
                        coinflip: { wins: 0, losses: 0 },
                        rps: { wins: 0, losses: 0, ties: 0 },
                        ttt: { wins: 0, losses: 0, ties: 0 }
                    },
                    joinedAt: Date.now(),
                    lastUpdated: Date.now()
                };
                season.totalPlayers = Object.keys(season.leaderboard).length;
                enrolledSeasons.push(seasonName);
            }
        }

        if (enrolledSeasons.length > 0) {
            await this.save();
        }

        return enrolledSeasons;
    }

    /**
     * Auto-enroll all guild members in a specific season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {Array} members - Array of guild members
     * @param {Function} getStats - Function to get user stats (userId) => {balance, xp, level, seasonalCoins, gambling}
     * @returns {Object} Result with count of enrolled users
     */
    async autoEnrollAllMembers(guildId, seasonName, members, getStats) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found', enrolled: 0 };
        }

        let enrolledCount = 0;
        for (const member of members) {
            if (!member.user.bot && !season.leaderboard[member.id]) {
                const stats = getStats(member.id) || {};
                season.leaderboard[member.id] = {
                    userId: member.id,
                    username: stats.username || member.user.username || 'Unknown User',
                    balance: stats.balance || 0,
                    xp: stats.xp || 0,
                    level: stats.level || 1,
                    coins: stats.seasonalCoins || 0,
                    gambling: stats.gambling || {
                        blackjack: { wins: 0, losses: 0, ties: 0 },
                        roulette: { wins: 0, losses: 0 },
                        slots: { wins: 0, losses: 0 },
                        dice: { wins: 0, losses: 0 },
                        coinflip: { wins: 0, losses: 0 },
                        rps: { wins: 0, losses: 0, ties: 0 },
                        ttt: { wins: 0, losses: 0, ties: 0 }
                    },
                    joinedAt: Date.now(),
                    lastUpdated: Date.now()
                };
                enrolledCount++;
            }
        }

        if (enrolledCount > 0) {
            season.totalPlayers = Object.keys(season.leaderboard).length;
            await this.save();
        }

        return { success: true, enrolled: enrolledCount };
    }

    /**
     * Check if user is enrolled in a season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {string} userId - Discord User ID
     * @returns {boolean} Whether user is enrolled
     */
    isUserEnrolled(guildId, seasonName, userId) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) return false;
        return !!season.leaderboard[userId];
    }

    /**
     * Update gambling stats for a user in a season
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {string} userId - Discord User ID
     * @param {Object} gamblingStats - Gambling stats object
     * @returns {Object} Result
     */
    async updateGamblingStats(guildId, seasonName, userId, gamblingStats) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found' };
        }

        const playerEntry = season.leaderboard[userId];
        if (!playerEntry) {
            return { success: false, error: 'Player not enrolled in season' };
        }

        playerEntry.gambling = gamblingStats;
        playerEntry.lastUpdated = Date.now();

        await this.save();
        return { success: true };
    }

    /**
     * Refresh all player stats in a season from live data
     * @param {string} guildId - Discord Guild ID
     * @param {string} seasonName - Season name
     * @param {Function} getStats - Function to get user stats (userId) => {balance, xp, level, seasonalCoins, gambling, username}
     * @returns {Object} Result
     */
    async refreshSeasonStats(guildId, seasonName, getStats) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found', updated: 0 };
        }

        let updatedCount = 0;
        for (const userId in season.leaderboard) {
            const stats = getStats(userId);
            if (stats) {
                season.leaderboard[userId].balance = stats.balance || 0;
                season.leaderboard[userId].xp = stats.xp || 0;
                season.leaderboard[userId].level = stats.level || 1;
                season.leaderboard[userId].coins = stats.seasonalCoins || 0;
                season.leaderboard[userId].gambling = stats.gambling || season.leaderboard[userId].gambling;
                if (stats.username) {
                    season.leaderboard[userId].username = stats.username;
                }
                season.leaderboard[userId].lastUpdated = Date.now();
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            await this.save();
        }

        return { success: true, updated: updatedCount };
    }
}

module.exports = new SeasonManager();
