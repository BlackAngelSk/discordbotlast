const fs = require('fs').promises;
const path = require('path');

const MAX_UPGRADE_LEVEL = 5;
const UPGRADE_COSTS = [5000, 12000, 26000, 50000, 90000];

function createDefaultStats() {
    return {
        attempts: 0,
        cleanWins: 0,
        messyWins: 0,
        partialWins: 0,
        busts: 0,
        biggestScore: 0,
        totalEarned: 0,
        totalLost: 0,
        totalLoot: 0,
        winStreak: 0,
        bestWinStreak: 0,
        failStreak: 0,
    };
}

function createDefaultUser() {
    return {
        xp: 0,
        level: 1,
        upgrades: {
            hacker: 0,
            driver: 0,
            muscle: 0,
            inside: 0,
        },
        cooldowns: {
            personalUntil: 0,
        },
        stats: createDefaultStats(),
    };
}

function createDefaultGuild() {
    return {
        cooldownUntil: 0,
        lastTarget: null,
    };
}

function calculateLevelFromXp(xp) {
    const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
    return Math.max(1, Math.floor(Math.sqrt(safeXp / 90)) + 1);
}

class HeistManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'heists.json');
        this.data = {
            users: {},
            guilds: {},
        };
        this.readyPromise = this.init();
    }

    async init() {
        try {
            const dir = path.dirname(this.dataPath);
            await fs.mkdir(dir, { recursive: true });

            const raw = await fs.readFile(this.dataPath, 'utf8');
            const parsed = JSON.parse(raw);
            this.data.users = parsed.users || {};
            this.data.guilds = parsed.guilds || {};
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading heist data:', error);
            }
        }
    }

    async ensureReady() {
        await this.readyPromise;
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving heist data:', error);
        }
    }

    normalizeUser(user) {
        const normalized = user || createDefaultUser();
        normalized.xp = Number.isFinite(normalized.xp) ? Math.max(0, normalized.xp) : 0;
        normalized.level = calculateLevelFromXp(normalized.xp);
        normalized.upgrades = {
            hacker: Number.isFinite(normalized.upgrades?.hacker) ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, normalized.upgrades.hacker)) : 0,
            driver: Number.isFinite(normalized.upgrades?.driver) ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, normalized.upgrades.driver)) : 0,
            muscle: Number.isFinite(normalized.upgrades?.muscle) ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, normalized.upgrades.muscle)) : 0,
            inside: Number.isFinite(normalized.upgrades?.inside) ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, normalized.upgrades.inside)) : 0,
        };
        normalized.cooldowns = {
            personalUntil: Number.isFinite(normalized.cooldowns?.personalUntil) ? normalized.cooldowns.personalUntil : 0,
        };
        normalized.stats = {
            ...createDefaultStats(),
            ...(normalized.stats || {}),
        };
        return normalized;
    }

    normalizeGuild(guild) {
        const normalized = guild || createDefaultGuild();
        normalized.cooldownUntil = Number.isFinite(normalized.cooldownUntil) ? normalized.cooldownUntil : 0;
        normalized.lastTarget = typeof normalized.lastTarget === 'string' ? normalized.lastTarget : null;
        return normalized;
    }

    getUser(userId) {
        const key = String(userId);
        if (!this.data.users[key]) {
            this.data.users[key] = createDefaultUser();
        }

        this.data.users[key] = this.normalizeUser(this.data.users[key]);
        return this.data.users[key];
    }

    getGuild(guildId) {
        const key = String(guildId);
        if (!this.data.guilds[key]) {
            this.data.guilds[key] = createDefaultGuild();
        }

        this.data.guilds[key] = this.normalizeGuild(this.data.guilds[key]);
        return this.data.guilds[key];
    }

    getPersonalCooldownRemaining(userId, now = Date.now()) {
        const profile = this.getUser(userId);
        return Math.max(0, profile.cooldowns.personalUntil - now);
    }

    getGuildCooldownRemaining(guildId, now = Date.now()) {
        const guild = this.getGuild(guildId);
        return Math.max(0, guild.cooldownUntil - now);
    }

    async setCooldowns({ guildId, participantIds, personalUntil, guildUntil, targetKey }) {
        for (const userId of participantIds) {
            const profile = this.getUser(userId);
            profile.cooldowns.personalUntil = Math.max(profile.cooldowns.personalUntil || 0, personalUntil);
        }

        const guild = this.getGuild(guildId);
        guild.cooldownUntil = Math.max(guild.cooldownUntil || 0, guildUntil);
        guild.lastTarget = targetKey;
        await this.save();
    }

    getUpgradeCost(type, currentLevel = null) {
        const level = currentLevel ?? 0;
        if (level >= MAX_UPGRADE_LEVEL) {
            return null;
        }
        return UPGRADE_COSTS[level];
    }

    async upgrade(userId, type) {
        const profile = this.getUser(userId);
        if (!Object.prototype.hasOwnProperty.call(profile.upgrades, type)) {
            throw new Error('Unknown upgrade');
        }

        const currentLevel = profile.upgrades[type];
        if (currentLevel >= MAX_UPGRADE_LEVEL) {
            throw new Error('Max level reached');
        }

        const cost = UPGRADE_COSTS[currentLevel];
        profile.upgrades[type] += 1;
        await this.save();
        return { newLevel: profile.upgrades[type], cost };
    }

    async recordOutcome(userId, outcome) {
        const profile = this.getUser(userId);
        const stats = profile.stats;

        stats.attempts += 1;
        stats.biggestScore = Math.max(stats.biggestScore || 0, outcome.netProfit || 0);
        stats.totalEarned += Math.max(0, outcome.payout || 0);
        stats.totalLost += Math.max(0, outcome.loss || 0);
        stats.totalLoot += Math.max(0, outcome.lootShare || 0);

        if (outcome.type === 'clean') {
            stats.cleanWins += 1;
            stats.winStreak += 1;
            stats.bestWinStreak = Math.max(stats.bestWinStreak || 0, stats.winStreak);
            stats.failStreak = 0;
        } else if (outcome.type === 'messy') {
            stats.messyWins += 1;
            stats.winStreak += 1;
            stats.bestWinStreak = Math.max(stats.bestWinStreak || 0, stats.winStreak);
            stats.failStreak = 0;
        } else if (outcome.type === 'partial') {
            stats.partialWins += 1;
            stats.winStreak = 0;
            stats.failStreak = 0;
        } else {
            stats.busts += 1;
            stats.winStreak = 0;
            stats.failStreak += 1;
        }

        profile.xp += Math.max(0, outcome.xp || 0);
        profile.level = calculateLevelFromXp(profile.xp);

        await this.save();
        return profile;
    }
}

module.exports = new HeistManager();