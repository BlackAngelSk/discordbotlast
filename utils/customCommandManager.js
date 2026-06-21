const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Enhanced Custom Command Manager
 *
 * Command data format (v2):
 *   {
 *     response: string|object,         – text response or embed JSON
 *     cooldown: number,                – per-user cooldown in seconds (0 = none)
 *     requiredRole: string|null,       – role ID required to use the command (null = anyone)
 *     allowedRole: string|null,        – alternative role name or ID
 *     createdBy: string,               – user ID of the creator
 *     createdAt: string,               – ISO timestamp
 *     usageCount: number,              – total times invoked
 *     lastUsedAt: string|null,         – ISO timestamp of last use
 *     aliases: string[],               – alternative names that trigger this command
 *     enabled: boolean                 – whether the command is active
 *   }
 *
 * Backward compatible: plain string responses are auto-wrapped into v2 format.
 */

class CustomCommandManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'customcommands.json');
        /** @type {Object<string, Object<string, any>>} */
        this.data = {};
        /** @type {Object<string, Object<string, number>>} Cooldown expiry tracking (in-memory only) */
        this.cooldowns = {};
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
            this.migrateAll();
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading custom commands:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving custom commands:', error);
        }
    }

    // ── Migration ──────────────────────────────────────────────────────────

    /**
     * Migrate a single command entry from v1 (string) to v2 (object) format.
     */
    migrateCommand(cmd) {
        if (typeof cmd === 'string') {
            return {
                response: cmd,
                cooldown: 0,
                requiredRole: null,
                createdBy: null,
                createdAt: null,
                usageCount: 0,
                lastUsedAt: null,
                aliases: [],
                enabled: true
            };
        }
        // Ensure all v2 fields exist
        return {
            response: cmd.response,
            cooldown: Number(cmd.cooldown) || 0,
            requiredRole: cmd.requiredRole || null,
            createdBy: cmd.createdBy || null,
            createdAt: cmd.createdAt || null,
            usageCount: Number(cmd.usageCount) || 0,
            lastUsedAt: cmd.lastUsedAt || null,
            aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
            enabled: cmd.enabled !== false
        };
    }

    migrateAll() {
        for (const guildId of Object.keys(this.data)) {
            for (const name of Object.keys(this.data[guildId])) {
                this.data[guildId][name] = this.migrateCommand(this.data[guildId][name]);
            }
        }
    }

    // ── CRUD ───────────────────────────────────────────────────────────────

    /**
     * Add or update a custom command.
     */
    async addCommand(guildId, name, response, options = {}) {
        if (!this.data[guildId]) {
            this.data[guildId] = {};
        }

        const existing = this.data[guildId][name.toLowerCase()];
        const existingMeta = existing && typeof existing === 'object' ? existing : {};

        this.data[guildId][name.toLowerCase()] = {
            response,
            cooldown: Number(options.cooldown ?? existingMeta.cooldown) || 0,
            requiredRole: options.requiredRole ?? existingMeta.requiredRole ?? null,
            createdBy: options.createdBy ?? existingMeta.createdBy ?? null,
            createdAt: existingMeta.createdAt || new Date().toISOString(),
            usageCount: existingMeta.usageCount || 0,
            lastUsedAt: existingMeta.lastUsedAt || null,
            aliases: Array.isArray(options.aliases) ? options.aliases : (existingMeta.aliases || []),
            enabled: options.enabled !== undefined ? options.enabled : (existingMeta.enabled !== false)
        };

        await this.save();
    }

    async removeCommand(guildId, name) {
        if (this.data[guildId]) {
            delete this.data[guildId][name.toLowerCase()];
            await this.save();
        }
    }

    /**
     * Get a command, auto-migrating v1 format.
     */
    getCommand(guildId, name) {
        if (!this.data[guildId]) return null;
        const cmd = this.data[guildId][name.toLowerCase()];
        if (!cmd) return null;
        return this.migrateCommand(cmd);
    }

    getCommands(guildId) {
        const raw = this.data[guildId] || {};
        const migrated = {};
        for (const [name, cmd] of Object.entries(raw)) {
            migrated[name] = this.migrateCommand(cmd);
        }
        return migrated;
    }

    // ── Enhanced Features ──────────────────────────────────────────────────

    /**
     * Check if a user is on cooldown for a command.
     * @returns {number} seconds remaining, or 0 if not on cooldown
     */
    getCooldownRemaining(guildId, commandName, userId) {
        const key = `${guildId}:${commandName}:${userId}`;
        const expiry = this.cooldowns[key] || 0;
        const now = Date.now();
        if (now >= expiry) return 0;
        return Math.ceil((expiry - now) / 1000);
    }

    /**
     * Set a cooldown for a user on a command.
     */
    setCooldown(guildId, commandName, userId, seconds) {
        if (seconds <= 0) return;
        const key = `${guildId}:${commandName}:${userId}`;
        this.cooldowns[key] = Date.now() + (seconds * 1000);
    }

    /**
     * Record a usage hit for a command.
     */
    async recordUsage(guildId, commandName) {
        if (!this.data[guildId] || !this.data[guildId][commandName]) return;
        const cmd = this.migrateCommand(this.data[guildId][commandName]);
        cmd.usageCount = (cmd.usageCount || 0) + 1;
        cmd.lastUsedAt = new Date().toISOString();
        this.data[guildId][commandName] = cmd;
        await this.save();
    }

    /**
     * Check if a member has the required role to use a command.
     * @param {object} member – Discord GuildMember-like object with roles
     * @param {string|null} requiredRoleId
     * @returns {boolean}
     */
    checkRolePermission(member, requiredRoleId) {
        if (!requiredRoleId) return true;
        if (!member || !member.roles) return false;
        return member.roles.cache?.has(requiredRoleId) || member.roles.includes?.(requiredRoleId);
    }

    /**
     * Find a command by name or alias.
     */
    findCommand(guildId, nameOrAlias) {
        const commands = this.data[guildId] || {};
        const lower = nameOrAlias.toLowerCase();

        // Direct name match
        if (commands[lower]) return { name: lower, command: this.migrateCommand(commands[lower]) };

        // Alias match
        for (const [cmdName, cmdData] of Object.entries(commands)) {
            const cmd = this.migrateCommand(cmdData);
            if (Array.isArray(cmd.aliases) && cmd.aliases.map(a => a.toLowerCase()).includes(lower)) {
                return { name: cmdName, command: cmd };
            }
        }

        return null;
    }

    /**
     * Get top commands by usage count for a guild.
     */
    getTopCommands(guildId, limit = 10) {
        const commands = this.getCommands(guildId);
        return Object.entries(commands)
            .map(([name, cmd]) => ({ name, ...cmd }))
            .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
            .slice(0, limit);
    }
}

module.exports = new CustomCommandManager();
