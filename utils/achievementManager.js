/**
 * Achievement Manager
 * Checks and awards achievements/badges to users based on activity.
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'achievements.json');

const ACHIEVEMENTS = [
    // Economy
    { id: 'first_daily', emoji: '📅', name: 'First Day', desc: 'Claim your first daily reward', secret: false },
    { id: 'streak_7', emoji: '🔥', name: 'Week Warrior', desc: 'Maintain a 7-day daily streak', secret: false },
    { id: 'streak_30', emoji: '💎', name: 'Monthly Master', desc: 'Maintain a 30-day daily streak', secret: false },
    { id: 'millionaire', emoji: '💰', name: 'Millionaire', desc: 'Reach 1,000,000 coins', secret: false },
    { id: 'broke', emoji: '🪙', name: 'Broke', desc: 'Have exactly 0 coins', secret: true },

    // Leveling
    { id: 'level_5', emoji: '⭐', name: 'Rising Star', desc: 'Reach level 5', secret: false },
    { id: 'level_10', emoji: '🌟', name: 'Star Power', desc: 'Reach level 10', secret: false },
    { id: 'level_25', emoji: '✨', name: 'Glowing', desc: 'Reach level 25', secret: false },
    { id: 'level_50', emoji: '🏆', name: 'Champion', desc: 'Reach level 50', secret: false },
    { id: 'level_100', emoji: '👑', name: 'Legend', desc: 'Reach level 100', secret: false },

    // Gambling
    { id: 'first_win', emoji: '🎰', name: 'Lucky Break', desc: 'Win your first gambling game', secret: false },
    { id: 'big_win', emoji: '🤑', name: 'High Roller', desc: 'Win 10,000+ coins in one game', secret: false },
    { id: 'gamble_100', emoji: '🎲', name: 'Gambling Addict', desc: 'Play 100 gambling games', secret: true },

    // Social
    { id: 'first_marry', emoji: '💍', name: 'Betrothed', desc: 'Get married for the first time', secret: false },
    { id: 'first_message', emoji: '💬', name: 'Chatterbox', desc: 'Send your first message tracked by the bot', secret: false },

    // Music
    { id: 'first_song', emoji: '🎵', name: 'DJ Starter', desc: 'Play your first song', secret: false },
];

class AchievementManager {
    constructor() {
        this.data = {}; // { 'guildId_userId': Set<achievementId> }
    }

    async init() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            for (const [key, ids] of Object.entries(parsed)) {
                this.data[key] = new Set(ids);
            }
        } catch {
            await this.save();
        }
    }

    async save() {
        const obj = {};
        for (const [key, set] of Object.entries(this.data)) {
            obj[key] = [...set];
        }
        await fs.writeFile(DATA_FILE, JSON.stringify(obj, null, 2));
    }

    key(guildId, userId) { return `${guildId}_${userId}`; }

    hasAchievement(guildId, userId, achievementId) {
        const k = this.key(guildId, userId);
        return this.data[k]?.has(achievementId) ?? false;
    }

    getUserAchievements(guildId, userId) {
        const k = this.key(guildId, userId);
        const ids = this.data[k] ? [...this.data[k]] : [];
        return ids.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean);
    }

    getAll() { return ACHIEVEMENTS; }

    /**
     * Award an achievement. Returns the achievement object if newly awarded, null if already had it.
     */
    async award(guildId, userId, achievementId) {
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement) return null;
        const k = this.key(guildId, userId);
        if (!this.data[k]) this.data[k] = new Set();
        if (this.data[k].has(achievementId)) return null;
        this.data[k].add(achievementId);
        await this.save();
        return achievement;
    }

    /**
     * Check conditions and award all applicable achievements.
     * Returns array of newly awarded achievements.
     */
    async checkAll(guildId, userId, {
        balance = 0,
        level = 1,
        streak = 0,
        gamblingGames = 0,
        gamesWon = 0,
        biggestWin = 0,
        married = false,
        songPlayed = false,
        firstMessage = false
    } = {}) {
        const awarded = [];

        const check = async (condition, achievementId) => {
            if (condition && !this.hasAchievement(guildId, userId, achievementId)) {
                const a = await this.award(guildId, userId, achievementId);
                if (a) awarded.push(a);
            }
        };

        await check(streak >= 1, 'first_daily');
        await check(streak >= 7, 'streak_7');
        await check(streak >= 30, 'streak_30');
        await check(balance >= 1_000_000, 'millionaire');
        await check(balance === 0, 'broke');
        await check(level >= 5, 'level_5');
        await check(level >= 10, 'level_10');
        await check(level >= 25, 'level_25');
        await check(level >= 50, 'level_50');
        await check(level >= 100, 'level_100');
        await check(gamesWon >= 1, 'first_win');
        await check(biggestWin >= 10000, 'big_win');
        await check(gamblingGames >= 100, 'gamble_100');
        await check(firstMessage, 'first_message');
        await check(married, 'first_marry');
        await check(songPlayed, 'first_song');

        return awarded;
    }

    async syncUser(guildId, userId, extra = {}) {
        try {
            const economyManager = require('./economyManager');
            const relationshipManager = require('./relationshipManager');
            const gameStatsManager = require('./gameStatsManager');

            const userData = economyManager.getUserData(guildId, userId);
            const gameStats = gameStatsManager.getUserStats(userId);

            return await this.checkAll(guildId, userId, {
                balance: userData.balance || 0,
                level: userData.level || 1,
                streak: userData.dailyStreak || 0,
                gamblingGames: gameStats.total || 0,
                gamesWon: gameStats.wins || 0,
                married: relationshipManager.isMarried(guildId, userId),
                ...extra
            });
        } catch (error) {
            console.error('Achievement sync error:', error);
            return [];
        }
    }
}

module.exports = new AchievementManager();
