const fs = require('fs').promises;
const path = require('path');

class CustomRoleShop {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'customRoles.json');
        this.rainbowRoles = new Set(); // Track rainbow roles
        this.data = {
            customRoles: {}, // guildId_userId: { roleId, colorHex, name, boughtAt, itemId, isRainbow }
            roleItems: {} // guildId: { items with prices }
        };
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
            
            // Load existing rainbow roles
            for (const [key, role] of Object.entries(this.data.customRoles)) {
                if (role.isRainbow) {
                    this.rainbowRoles.add(role.roleId);
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading custom roles data:', error);
            }
        }

        // Start rainbow color rotation
        this.startRainbowRotation();
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving custom roles data:', error);
        }
    }

    // Initialize default shop items for a guild
    initializeShop(guildId) {
        if (!this.data.roleItems[guildId]) {
            this.data.roleItems[guildId] = {
                colorRoles: [
                    { id: 'red', name: 'Red Elite', color: '#FF0000', price: 5000, description: 'Red role color' },
                    { id: 'blue', name: 'Blue Elite', color: '#0000FF', price: 5000, description: 'Blue role color' },
                    { id: 'purple', name: 'Purple Prestige', color: '#9933FF', price: 7500, description: 'Purple role color' },
                    { id: 'gold', name: 'Gold Legend', color: '#FFD700', price: 10000, description: 'Golden role color' },
                    { id: 'rainbow', name: 'Rainbow Master', color: '#FF6B9D', price: 15000, description: 'Rainbow role color (changes every 3s)' },
                    { id: 'aqua', name: 'Aqua Royal', color: '#00FFFF', price: 8000, description: 'Aqua role color' },
                    { id: 'lime', name: 'Lime Legend', color: '#00FF00', price: 6000, description: 'Lime role color' },
                ],
                badges: [
                    { id: 'badge_vip', name: '👑 VIP', price: 3000, description: 'VIP badge in name' },
                    { id: 'badge_premium', name: '⭐ Premium', price: 2500, description: 'Premium badge in name' },
                    { id: 'badge_veteran', name: '🎖️ Veteran', price: 5000, description: 'Veteran badge in name' },
                ]
            };
        }
        return this.data.roleItems[guildId];
    }

    async buyCustomRole(guildId, userId, itemId, guild, economyManager) {
        this.initializeShop(guildId);
        const shop = this.data.roleItems[guildId];
        let item = null;
        let category = null;

        // Find item in shop
        for (const [cat, items] of Object.entries(shop)) {
            const found = items.find(i => i.id === itemId);
            if (found) {
                item = found;
                category = cat;
                break;
            }
        }

        if (!item) return { success: false, message: 'Item not found' };

        // Check if user has enough balance
        console.log(`[Shop Debug] Before getUserData - checking key: ${guildId}_${userId}`);
        console.log(`[Shop Debug] All economy users:`, Object.keys(economyManager.data.users).slice(0, 5));
        
        const userData = economyManager.getUserData(guildId, userId);
        const balance = userData.balance || 0;
        
        console.log(`[Shop Debug] After getUserData - userData:`, userData);
        console.log(`[Shop] User ${userId} in guild ${guildId} balance: ${balance}, Item: ${item.name} (${item.price})`);
        
        if (balance < item.price) {
            return { success: false, message: `Not enough coins! Need **${item.price}**, have **${balance}**` };
        }

        // Check if user already has a custom role
        const key = `${guildId}_${userId}`;
        if (this.data.customRoles[key]) {
            return { success: false, message: 'You already have a custom role! Remove it first with `/customrole remove`' };
        }

        try {
            // Create the role
            const role = await guild.roles.create({
                name: item.name,
                color: item.color,
                reason: `Custom role purchased by ${userId}`
            });

            // Add role to user
            const member = await guild.members.fetch(userId);
            await member.roles.add(role);

            // Deduct coins from economy manager
            const success = await economyManager.removeMoney(guildId, userId, item.price);
            if (!success) {
                await role.delete('Failed to deduct coins');
                return { success: false, message: `Failed to deduct coins from your balance!` };
            }

            // Store custom role
            const isRainbow = itemId === 'rainbow';
            this.data.customRoles[key] = {
                roleId: role.id,
                colorHex: item.color,
                name: item.name,
                boughtAt: new Date().toISOString(),
                itemId: itemId,
                isRainbow: isRainbow
            };

            if (isRainbow) {
                this.rainbowRoles.add(role.id);
            }

            await this.save();
            console.log(`[Shop] Purchase successful! ${item.name} for ${item.price} coins`);
            return { success: true, message: `✅ Purchased **${item.name}** for **${item.price}** coins! Role created and assigned.`, roleId: role.id };
        } catch (error) {
            console.error('Error creating custom role:', error);
            return { success: false, message: `Error creating role: ${error.message}` };
        }
    }

    getCustomRole(guildId, userId) {
        const key = `${guildId}_${userId}`;
        return this.data.customRoles[key] || null;
    }

    async removeCustomRole(guildId, userId, guild) {
        const key = `${guildId}_${userId}`;
        const customRole = this.data.customRoles[key];

        if (!customRole) return false;

        try {
            const role = await guild.roles.fetch(customRole.roleId);
            if (role) {
                await role.delete('Custom role removed by user');
            }
        } catch (e) {
            console.log('Error deleting role:', e);
        }

        if (customRole.isRainbow) {
            this.rainbowRoles.delete(customRole.roleId);
        }

        delete this.data.customRoles[key];
        await this.save();
        return true;
    }

    getShopItems(guildId) {
        return this.initializeShop(guildId);
    }

    getItemInfo(guildId, itemId) {
        const shop = this.initializeShop(guildId);
        for (const items of Object.values(shop)) {
            const item = items.find(i => i.id === itemId);
            if (item) return item;
        }
        return null;
    }

    // Rainbow color rotation
    startRainbowRotation() {
        const colors = [
            0xFF0000, // Red
            0xFF7F00, // Orange
            0xFFFF00, // Yellow
            0x00FF00, // Green
            0x0000FF, // Blue
            0x4B0082, // Indigo
            0x9400D3  // Violet
        ];

        let colorIndex = 0;

        setInterval(async () => {
            if (this.rainbowRoles.size === 0) return;

            const color = colors[colorIndex];
            colorIndex = (colorIndex + 1) % colors.length;

            // Update all rainbow roles
            for (const [key, customRole] of Object.entries(this.data.customRoles)) {
                if (customRole.isRainbow) {
                    try {
                        const [guildId, userId] = key.split('_');
                        // We need to fetch the guild from client, but we'll handle this in the event
                        this.pendingRainbowUpdate = this.pendingRainbowUpdate || [];
                        this.pendingRainbowUpdate.push({ roleId: customRole.roleId, color });
                    } catch (e) {
                        console.error('Error updating rainbow role:', e);
                    }
                }
            }
        }, 3000); // Change color every 3 seconds
    }

    // Call this from a ready event with the client
    async applyRainbowUpdates(client) {
        if (!this.pendingRainbowUpdate || this.pendingRainbowUpdate.length === 0) return;

        const updates = this.pendingRainbowUpdate;
        this.pendingRainbowUpdate = [];

        for (const { roleId, color } of updates) {
            try {
                // Find guild with this role
                for (const guild of client.guilds.cache.values()) {
                    try {
                        const role = await guild.roles.fetch(roleId);
                        if (role) {
                            await role.edit({ color });
                            break;
                        }
                    } catch (e) {
                        // Role doesn't exist in this guild, continue
                    }
                }
            } catch (e) {
                console.error('Error applying rainbow update:', e);
            }
        }
    }
}

module.exports = new CustomRoleShop();
