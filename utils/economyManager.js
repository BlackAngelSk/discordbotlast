const fs = require('fs').promises;
const path = require('path');

class EconomyManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'economy.json');
        this.data = {
            users: {},
            shops: {}
        };
    }

    async init() {
        try {
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
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

    getUserData(guildId, userId) {
        const key = `${guildId}_${userId}`;
        if (!this.data.users[key]) {
            this.data.users[key] = {
                balance: 0,
                xp: 0,
                level: 1,
                lastDaily: null,
                lastWeekly: null,
                inventory: [],
                dailyStreak: 0,
                streakBonusMultiplier: 1,
                seasonalCoins: 0
            };
        }
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
        const newLevel = Math.floor(Math.sqrt(userData.xp / 100)) + 1;
        const leveledUp = newLevel > userData.level;
        userData.level = newLevel;
        
        await this.save();
        return { leveledUp, level: newLevel };
    }

    getLeaderboard(guildId, type = 'balance', limit = 10) {
        const guildUsers = Object.entries(this.data.users)
            .filter(([key]) => key.startsWith(`${guildId}_`))
            .map(([key, data]) => ({
                userId: key.split('_')[1],
                ...data
            }))
            .sort((a, b) => b[type] - a[type])
            .slice(0, limit);
        
        return guildUsers;
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
                { id: 'vip', name: 'VIP Role', price: 10000, type: 'role' },
                { id: 'custom_role', name: 'Custom Role Color', price: 5000, type: 'role' },
                { id: 'premium', name: 'Premium Badge', price: 15000, type: 'badge' }
            ];
        }
        return this.data.shops[guildId];
    }
}

module.exports = new EconomyManager();
