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
     * @param {Object} stats - Player stats {balance, xp, level}
     */
    async recordPlayerStats(guildId, seasonName, userId, stats) {
        const season = this.getSeason(guildId, seasonName);
        if (!season) {
            return { success: false, error: 'Season not found' };
        }

        season.leaderboard[userId] = {
            userId,
            balance: stats.balance || 0,
            xp: stats.xp || 0,
            level: stats.level || 1,
            coins: stats.seasonalCoins || 0,
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
}

module.exports = new SeasonManager();
