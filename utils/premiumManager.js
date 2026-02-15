/**
 * Premium Features Manager
 * Handles premium subscriptions, exclusive features, and tier benefits
 */

const databaseManager = require('./databaseManager');
const fs = require('fs').promises;
const path = require('path');

class PremiumManager {
    constructor() {
        this.premiumTiers = {
            basic: {
                name: 'Basic Premium',
                price: 2.99,
                features: ['custom-commands', 'advanced-economy'],
                commandLimit: 10,
                customShopSlots: 5,
                monthlyBonus: 500
            },
            pro: {
                name: 'Pro Premium',
                price: 5.99,
                features: ['custom-commands', 'advanced-economy', 'exclusive-minigames', 'priority-support'],
                commandLimit: 25,
                customShopSlots: 15,
                monthlyBonus: 1500,
                exclusiveMinigames: ['crypto-casino', 'stock-market', 'treasure-hunt']
            },
            elite: {
                name: 'Elite Premium',
                price: 9.99,
                features: ['custom-commands', 'advanced-economy', 'exclusive-minigames', 'priority-support', 'custom-bots'],
                commandLimit: 100,
                customShopSlots: 50,
                monthlyBonus: 3000,
                exclusiveMinigames: ['crypto-casino', 'stock-market', 'treasure-hunt', 'dragon-slayer'],
                customBotSlot: 1
            }
        };
        this.dataFile = path.join(__dirname, '..', 'data', 'premium.json');
    }

    async init() {
        try {
            await fs.access(this.dataFile);
        } catch {
            await fs.writeFile(this.dataFile, JSON.stringify({}, null, 2));
        }
    }

    async getPremiumData(userId) {
        try {
            const data = await fs.readFile(this.dataFile, 'utf-8');
            const premiumData = JSON.parse(data);
            return premiumData[userId] || null;
        } catch {
            return null;
        }
    }

    async addPremium(userId, tier, guildId = null) {
        const premiumData = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        premiumData[userId] = {
            tier,
            guildId,
            purchasedAt: new Date(),
            expiresAt,
            isActive: true,
            customCommands: [],
            customShopItems: [],
            features: this.premiumTiers[tier].features
        };

        await fs.writeFile(this.dataFile, JSON.stringify(premiumData, null, 2));
        return premiumData[userId];
    }

    async renewPremium(userId) {
        const premiumData = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        if (!premiumData[userId]) return null;

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        premiumData[userId].expiresAt = expiresAt;
        premiumData[userId].isActive = true;

        await fs.writeFile(this.dataFile, JSON.stringify(premiumData, null, 2));
        return premiumData[userId];
    }

    async addCustomCommand(userId, command) {
        const premiumData = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        if (!premiumData[userId]) return null;

        const tier = premiumData[userId].tier;
        if (premiumData[userId].customCommands.length >= this.premiumTiers[tier].commandLimit) {
            throw new Error(`Command limit reached for ${tier} tier`);
        }

        command.id = Date.now().toString();
        premiumData[userId].customCommands.push(command);
        await fs.writeFile(this.dataFile, JSON.stringify(premiumData, null, 2));
        return command;
    }

    async addCustomShopItem(userId, item) {
        const premiumData = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        if (!premiumData[userId]) return null;

        const tier = premiumData[userId].tier;
        if (premiumData[userId].customShopItems.length >= this.premiumTiers[tier].customShopSlots) {
            throw new Error(`Shop slot limit reached for ${tier} tier`);
        }

        item.id = Date.now().toString();
        premiumData[userId].customShopItems.push(item);
        await fs.writeFile(this.dataFile, JSON.stringify(premiumData, null, 2));
        return item;
    }

    async getMonthlyBonus(userId) {
        const premium = await this.getPremiumData(userId);
        if (!premium || !premium.isActive) return 0;
        return this.premiumTiers[premium.tier].monthlyBonus;
    }

    async hasFeature(userId, feature) {
        const premium = await this.getPremiumData(userId);
        if (!premium || !premium.isActive) return false;
        return premium.features.includes(feature);
    }

    async checkAndUpdateExpiry() {
        const premiumData = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        let updated = false;

        for (const userId in premiumData) {
            if (new Date() > new Date(premiumData[userId].expiresAt)) {
                premiumData[userId].isActive = false;
                updated = true;
            }
        }

        if (updated) {
            await fs.writeFile(this.dataFile, JSON.stringify(premiumData, null, 2));
        }
    }

    getPricingTier(tier) {
        return this.premiumTiers[tier];
    }

    getAllTiers() {
        return this.premiumTiers;
    }
}

module.exports = new PremiumManager();
