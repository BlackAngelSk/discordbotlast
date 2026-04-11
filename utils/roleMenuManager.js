const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'roleMenus.json');

class RoleMenuManager {
    constructor() {
        // { guildId: { menuId: { title, description, channelId, messageId, roles: [{ roleId, label, description?, emoji? }], multiSelect } } }
        this.data = {};
    }

    async load() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    getMenus(guildId) {
        return this.data[guildId] ? Object.entries(this.data[guildId]).map(([id, v]) => ({ id, ...v })) : [];
    }

    getMenu(guildId, menuId) {
        return this.data[guildId]?.[menuId] || null;
    }

    getMenuByMessage(guildId, messageId) {
        if (!this.data[guildId]) return null;
        for (const [id, menu] of Object.entries(this.data[guildId])) {
            if (menu.messageId === messageId) return { id, ...menu };
        }
        return null;
    }

    async create(guildId, menuId, config) {
        if (!this.data[guildId]) this.data[guildId] = {};
        this.data[guildId][menuId] = config;
        await this.save();
    }

    async updateMessageId(guildId, menuId, messageId) {
        if (!this.data[guildId]?.[menuId]) return;
        this.data[guildId][menuId].messageId = messageId;
        await this.save();
    }

    async deleteMenu(guildId, menuId) {
        if (!this.data[guildId]) return;
        delete this.data[guildId][menuId];
        await this.save();
    }
}

const manager = new RoleMenuManager();
manager.load().catch(console.error);
module.exports = manager;
