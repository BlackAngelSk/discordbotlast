const fs = require('fs').promises;
const path = require('path');

class ShopManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'shop.json');
        this.data = {
            items: {}, // { guildId: { itemId: { name, price, type, roleId, duration } } }
            purchases: {} // { guildId: { userId: [{ itemId, purchasedAt, expiresAt }] } }
        };
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });
            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading shop:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving shop:', error);
        }
    }

    getItems(guildId) {
        return this.data.items[guildId] || {};
    }

    getItem(guildId, itemId) {
        return this.data.items[guildId]?.[itemId] || null;
    }

    async addItem(guildId, item) {
        if (!this.data.items[guildId]) {
            this.data.items[guildId] = {};
        }
        
        const itemId = `${guildId}_${Date.now()}`;
        this.data.items[guildId][itemId] = {
            id: itemId,
            name: item.name,
            description: item.description || 'No description',
            price: item.price,
            type: item.type, // 'role', 'temp_role', 'color_role'
            roleId: item.roleId || null,
            duration: item.duration || null, // For temporary items (in days)
            stock: item.stock || null, // null = unlimited
            createdAt: new Date().toISOString()
        };

        await this.save();
        return itemId;
    }

    async removeItem(guildId, itemId) {
        if (this.data.items[guildId]?.[itemId]) {
            delete this.data.items[guildId][itemId];
            await this.save();
            return true;
        }
        return false;
    }

    async updateItem(guildId, itemId, updates) {
        const item = this.getItem(guildId, itemId);
        if (item) {
            Object.assign(item, updates);
            await this.save();
            return true;
        }
        return false;
    }

    async purchaseItem(guildId, userId, itemId) {
        const item = this.getItem(guildId, itemId);
        if (!item) return { success: false, error: 'Item not found' };

        // Check stock
        if (item.stock !== null) {
            if (item.stock <= 0) {
                return { success: false, error: 'Out of stock' };
            }
            item.stock--;
        }

        // Record purchase
        if (!this.data.purchases[guildId]) {
            this.data.purchases[guildId] = {};
        }
        if (!this.data.purchases[guildId][userId]) {
            this.data.purchases[guildId][userId] = [];
        }

        const purchase = {
            itemId,
            itemName: item.name,
            purchasedAt: new Date().toISOString(),
            expiresAt: item.duration ? 
                new Date(Date.now() + item.duration * 24 * 60 * 60 * 1000).toISOString() : null
        };

        this.data.purchases[guildId][userId].push(purchase);
        await this.save();

        return { success: true, item, purchase };
    }

    getUserPurchases(guildId, userId) {
        return this.data.purchases[guildId]?.[userId] || [];
    }

    getActivePurchases(guildId, userId) {
        const purchases = this.getUserPurchases(guildId, userId);
        const now = new Date();
        
        return purchases.filter(p => {
            if (!p.expiresAt) return true; // Permanent
            return new Date(p.expiresAt) > now;
        });
    }

    async removeExpiredPurchases() {
        const now = new Date();
        let modified = false;

        for (const guildId in this.data.purchases) {
            for (const userId in this.data.purchases[guildId]) {
                const purchases = this.data.purchases[guildId][userId];
                const active = purchases.filter(p => {
                    if (!p.expiresAt) return true;
                    return new Date(p.expiresAt) > now;
                });

                if (active.length !== purchases.length) {
                    this.data.purchases[guildId][userId] = active;
                    modified = true;
                }
            }
        }

        if (modified) await this.save();
        return modified;
    }
}

module.exports = new ShopManager();
