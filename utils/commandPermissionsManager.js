const fs = require('fs').promises;
const path = require('path');

class CommandPermissionsManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'commandPermissions.json');
        this.data = { guilds: {} };
        this.loaded = false;
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const fileData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileData);
            this.loaded = true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading command permissions:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving command permissions:', error);
        }
    }

    getGuildConfig(guildId) {
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = {
                disabled: [],
                rolePermissions: {}
            };
        }
        return this.data.guilds[guildId];
    }

    isCommandEnabled(guildId, commandName) {
        const cfg = this.getGuildConfig(guildId);
        return !cfg.disabled.includes(commandName);
    }

    getRequiredRole(guildId, commandName) {
        const cfg = this.getGuildConfig(guildId);
        return cfg.rolePermissions[commandName] || null;
    }

    async disableCommand(guildId, commandName) {
        const cfg = this.getGuildConfig(guildId);
        if (!cfg.disabled.includes(commandName)) {
            cfg.disabled.push(commandName);
            await this.save();
        }
    }

    async enableCommand(guildId, commandName) {
        const cfg = this.getGuildConfig(guildId);
        cfg.disabled = cfg.disabled.filter(c => c !== commandName);
        await this.save();
    }

    async setCommandRole(guildId, commandName, roleId) {
        const cfg = this.getGuildConfig(guildId);
        if (roleId) {
            cfg.rolePermissions[commandName] = roleId;
        } else {
            delete cfg.rolePermissions[commandName];
        }
        await this.save();
    }
}

module.exports = new CommandPermissionsManager();
