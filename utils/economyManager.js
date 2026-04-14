const fs = require('fs').promises;
const path = require('path');

const MAX_LEVEL = 10000000000;

function calculateLevelFromXP(xp) {
    const safeXP = Number.isFinite(xp) ? Math.max(0, xp) : 0;
    const rawLevel = Math.floor(Math.sqrt(safeXP / 100)) + 1;
    return Math.min(MAX_LEVEL, rawLevel);
}

function createDefaultUserData() {
    return {
        balance: 0,
        xp: 0,
        level: 1,
        highestLevelReached: 1,
        lastDaily: null,
        lastWeekly: null,
        inventory: [],
        dailyStreak: 0,
        streakBonusMultiplier: 1,
        seasonalCoins: 0,
        guilds: []
    };
}

class EconomyManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'economy.json');
        this.data = {
            users: {},
            shops: {}
        };
        // Double XP events: { guildId: { multiplier, endsAt } }
        this.xpEvents = new Map();
    }

    async init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
            this.data.users = this.data.users || {};
            this.data.shops = this.data.shops || {};

            const migrated = this.migrateToGlobalUsers();
            if (migrated) {
                await this.save();
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading economy data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving economy data:', error);
        }
    }

    getUserKey(userId) {
        return String(userId);
    }

    normalizeUserData(userData, guildId = null) {
        const user = userData || createDefaultUserData();
        user.balance = Number.isFinite(user.balance) ? user.balance : 0;
        user.xp = Number.isFinite(user.xp) ? Math.max(0, user.xp) : 0;
        user.inventory = Array.isArray(user.inventory) ? user.inventory : [];
        user.dailyStreak = Number.isFinite(user.dailyStreak) ? user.dailyStreak : 0;
        user.streakBonusMultiplier = Number.isFinite(user.streakBonusMultiplier) ? user.streakBonusMultiplier : 1;
        user.seasonalCoins = Number.isFinite(user.seasonalCoins) ? user.seasonalCoins : 0;
        user.guilds = Array.isArray(user.guilds) ? [...new Set(user.guilds.map(String))] : [];

        if (guildId !== null && guildId !== undefined) {
            const normalizedGuildId = String(guildId);
            if (normalizedGuildId && normalizedGuildId !== 'null' && normalizedGuildId !== 'undefined' && !user.guilds.includes(normalizedGuildId)) {
                user.guilds.push(normalizedGuildId);
            }
        }

        const inferredLevel = calculateLevelFromXP(user.xp);
        const storedLevel = Number.isFinite(user.level) ? Math.max(1, user.level) : 1;
        user.level = Math.min(MAX_LEVEL, Math.max(storedLevel, inferredLevel));

        const highestStored = Number.isFinite(user.highestLevelReached) ? Math.max(1, user.highestLevelReached) : 1;
        user.highestLevelReached = Math.min(MAX_LEVEL, Math.max(highestStored, user.level));

        return user;
    }

    mergeUserData(targetData = {}, sourceData = {}, guildId = null) {
        const target = this.normalizeUserData({ ...createDefaultUserData(), ...targetData });
        const source = this.normalizeUserData({ ...createDefaultUserData(), ...sourceData }, guildId);

        const merged = {
            balance: target.balance + source.balance,
            xp: target.xp + source.xp,
            level: Math.max(target.level, source.level),
            highestLevelReached: Math.max(target.highestLevelReached, source.highestLevelReached),
            lastDaily: Math.max(target.lastDaily || 0, source.lastDaily || 0) || null,
            lastWeekly: Math.max(target.lastWeekly || 0, source.lastWeekly || 0) || null,
            inventory: [...new Set([...target.inventory, ...source.inventory])],
            dailyStreak: Math.max(target.dailyStreak, source.dailyStreak),
            streakBonusMultiplier: Math.max(target.streakBonusMultiplier, source.streakBonusMultiplier),
            seasonalCoins: target.seasonalCoins + source.seasonalCoins,
            guilds: [...new Set([...target.guilds, ...source.guilds])]
        };

        return this.normalizeUserData(merged);
    }

    migrateToGlobalUsers() {
        if (!this.data.users || typeof this.data.users !== 'object') {
            this.data.users = {};
            return false;
        }

        const migratedUsers = {};
        let changed = false;

        for (const [key, userData] of Object.entries(this.data.users)) {
            const legacyMatch = String(key).match(/^([^_]+)_(.+)$/);
            const userId = legacyMatch ? legacyMatch[2] : String(key);
            const guildId = legacyMatch ? legacyMatch[1] : null;

            if (legacyMatch) {
                changed = true;
            }

            migratedUsers[userId] = this.mergeUserData(migratedUsers[userId], userData, guildId);
        }

        const originalKeys = Object.keys(this.data.users).length;
        const migratedKeys = Object.keys(migratedUsers).length;

        this.data.users = migratedUsers;
        return changed || originalKeys !== migratedKeys;
    }

    getUserData(guildId, userId) {
        const key = this.getUserKey(userId);

        if (!this.data.users[key]) {
            this.data.users[key] = createDefaultUserData();
        }

        this.normalizeUserData(this.data.users[key], guildId);
        return this.data.users[key];
    }

    async addMoney(guildId, userId, amount) {
        const userData = this.getUserData(guildId, userId);
        userData.balance += amount;
        await this.save();
        return userData.balance;
    }

    async removeMoney(guildId, userId, amount) {
        const userData = this.getUserData(guildId, userId);
        if (userData.balance < amount) return false;
        userData.balance -= amount;
        await this.save();
        return true;
    }

    async addXP(guildId, userId, xp) {
        const userData = this.getUserData(guildId, userId);
        userData.xp += xp;
        
        // Calculate level (xp = level^2 * 100)
        const newLevel = calculateLevelFromXP(userData.xp);
        const previousHighest = Number.isFinite(userData.highestLevelReached)
            ? userData.highestLevelReached
            : userData.level;
        const leveledUp = newLevel > previousHighest;
        userData.level = newLevel;
        userData.highestLevelReached = Math.min(MAX_LEVEL, Math.max(previousHighest, newLevel));
        
        await this.save();
        return { leveledUp, level: newLevel };
    }

    getLeaderboard(guildId, type = 'balance', limit = 10) {
        const normalizedGuildId = guildId ? String(guildId) : null;

        return Object.entries(this.data.users)
            .map(([userId, data]) => ({
                userId,
                ...this.normalizeUserData(data)
            }))
            .filter(user => {
                if (!normalizedGuildId) return true;
                return !user.guilds.length || user.guilds.includes(normalizedGuildId);
            })
            .sort((a, b) => (b[type] || 0) - (a[type] || 0))
            .slice(0, limit);
    }

    getGlobalLeaderboard(type = 'balance', limit = 100) {
        return Object.entries(this.data.users)
            .map(([userId, data]) => {
                const user = this.normalizeUserData(data);
                return {
                    userId,
                    ...user,
                    totalCoins: user.seasonalCoins || 0
                };
            })
            .sort((a, b) => (b[type] || 0) - (a[type] || 0))
            .slice(0, limit);
    }

    async claimDaily(guildId, userId) {
        const userData = this.getUserData(guildId, userId);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (userData.lastDaily && (now - userData.lastDaily) < oneDay) {
            const timeLeft = oneDay - (now - userData.lastDaily);
            return { success: false, timeLeft };
        }

        // Check if streak is still active (within 48 hours)
        if (userData.lastDaily && (now - userData.lastDaily) < (2 * oneDay)) {
            userData.dailyStreak = (userData.dailyStreak || 0) + 1;
        } else {
            userData.dailyStreak = 1;
        }

        // Calculate multiplier based on streak (caps at 3x after 7 days)
        userData.streakBonusMultiplier = Math.min(1 + (userData.dailyStreak * 0.2), 3);
        
        const baseAmount = 1000;
        const amount = Math.floor(baseAmount * userData.streakBonusMultiplier);
        
        userData.lastDaily = now;
        userData.balance += amount;
        userData.seasonalCoins = (userData.seasonalCoins || 0) + amount;
        await this.save();
        
        return { success: true, amount, streak: userData.dailyStreak, multiplier: userData.streakBonusMultiplier };
    }

    async claimWeekly(guildId, userId) {
        const userData = this.getUserData(guildId, userId);
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (userData.lastWeekly && (now - userData.lastWeekly) < oneWeek) {
            const timeLeft = oneWeek - (now - userData.lastWeekly);
            return { success: false, timeLeft };
        }

        const amount = 5000;
        userData.lastWeekly = now;
        userData.balance += amount;
        await this.save();
        
        return { success: true, amount };
    }

    async addItem(guildId, userId, item) {
        const userData = this.getUserData(guildId, userId);
        userData.inventory.push(item);
        await this.save();
    }

    getShopItems(guildId) {
        if (!this.data.shops[guildId]) {
            this.data.shops[guildId] = [
                { id: 'vip', name: 'VIP Role', price: 10000, type: 'role', description: 'Get VIP status in the server' },
                { id: 'custom_role', name: 'Custom Role Color', price: 5000, type: 'role', description: 'Choose your own role color' },
                { id: 'premium', name: 'Premium Badge', price: 15000, type: 'badge', description: 'Premium member badge' }
            ];
        }
        return this.data.shops[guildId];
    }

    async addShopItem(guildId, item) {
        if (!this.data.shops[guildId]) {
            this.data.shops[guildId] = [];
        }
        this.data.shops[guildId].push(item);
        await this.save();
    }

    async removeShopItem(guildId, itemId) {
        if (this.data.shops[guildId]) {
            const before = this.data.shops[guildId].length;
            this.data.shops[guildId] = this.data.shops[guildId].filter(item => item.id !== itemId);
            const after = this.data.shops[guildId].length;
            if (before > after) {
                await this.save();
                return true;
            }
        }
        return false;
    }

    async addBalance(guildId, userId, amount) {
        const userData = this.getUserData(guildId, userId);
        userData.balance += amount;
        await this.save();
        return userData.balance;
    }

    async removeBalance(guildId, userId, amount) {
        const userData = this.getUserData(guildId, userId);
        userData.balance = Math.max(0, userData.balance - amount);
        await this.save();
        return userData.balance;
    }

    async setBalance(guildId, userId, amount) {
        const userData = this.getUserData(guildId, userId);
        userData.balance = amount;
        await this.save();
        return userData.balance;
    }

    // ── XP Event methods ──────────────────────────────────────────────────────
    startXPEvent(guildId, multiplier, durationMs) {
        const endsAt = Date.now() + durationMs;
        this.xpEvents.set(guildId, { multiplier, endsAt });
        // Auto-clean after duration
        setTimeout(() => {
            const ev = this.xpEvents.get(guildId);
            if (ev && ev.endsAt <= Date.now()) this.xpEvents.delete(guildId);
        }, durationMs + 1000);
    }

    stopXPEvent(guildId) {
        this.xpEvents.delete(guildId);
    }

    getXPEvent(guildId) {
        const ev = this.xpEvents.get(guildId);
        if (!ev) return null;
        if (ev.endsAt <= Date.now()) {
            this.xpEvents.delete(guildId);
            return null;
        }
        return ev;
    }

    getXPMultiplier(guildId) {
        const ev = this.getXPEvent(guildId);
        return ev ? ev.multiplier : 1;
    }
}

module.exports = new EconomyManager();
