/**
 * API Key Manager
 * Manages API keys for the public REST API.
 * Keys are stored in data/apiKeys.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_FILE = path.join(__dirname, '..', '..', 'data', 'apiKeys.json');

class ApiKeyManager {
    constructor() {
        /** @type {Map<string, { key: string, name: string, guildIds: string[], scopes: string[], createdAt: string, lastUsedAt: string|null, requestCount: number }>} */
        this.keys = new Map();
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(KEYS_FILE)) {
                const raw = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
                for (const entry of Object.values(raw)) {
                    this.keys.set(entry.key, {
                        key: entry.key,
                        name: entry.name || 'Unnamed',
                        guildIds: Array.isArray(entry.guildIds) ? entry.guildIds : [],
                        scopes: Array.isArray(entry.scopes) ? entry.scopes : ['read'],
                        createdAt: entry.createdAt || new Date().toISOString(),
                        lastUsedAt: entry.lastUsedAt || null,
                        requestCount: entry.requestCount || 0
                    });
                }
            }
        } catch (err) {
            console.error('Failed to load API keys:', err.message);
        }
    }

    save() {
        try {
            const dir = path.dirname(KEYS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const obj = {};
            for (const [key, value] of this.keys) {
                obj[key] = value;
            }
            fs.writeFileSync(KEYS_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            console.error('Failed to save API keys:', err.message);
        }
    }

    /**
     * Generate a new API key.
     */
    generateKey(name, guildIds = [], scopes = ['read']) {
        const key = 'dbot_' + crypto.randomBytes(32).toString('hex');
        const entry = {
            key,
            name: name || 'Unnamed',
            guildIds: Array.isArray(guildIds) ? guildIds : [],
            scopes: Array.isArray(scopes) ? scopes : ['read'],
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            requestCount: 0
        };
        this.keys.set(key, entry);
        this.save();
        return entry;
    }

    /**
     * Validate an API key and return its data, or null if invalid.
     */
    validate(key) {
        if (!key || typeof key !== 'string') return null;
        const entry = this.keys.get(key);
        if (!entry) return null;
        return entry;
    }

    /**
     * Record a usage hit for the key.
     */
    recordUsage(key) {
        const entry = this.keys.get(key);
        if (entry) {
            entry.lastUsedAt = new Date().toISOString();
            entry.requestCount++;
            // Don't save on every request for performance; periodic saves handled externally
        }
    }

    /**
     * Check if a key has access to a given scope.
     */
    hasScope(keyData, scope) {
        if (!keyData || !Array.isArray(keyData.scopes)) return false;
        return keyData.scopes.includes(scope) || keyData.scopes.includes('admin');
    }

    /**
     * Check if a key has access to a given guild.
     */
    hasGuildAccess(keyData, guildId) {
        if (!keyData) return false;
        // Empty guildIds means access to all guilds the bot is in
        if (keyData.guildIds.length === 0) return true;
        return keyData.guildIds.includes(guildId);
    }

    /**
     * Revoke an API key.
     */
    revoke(key) {
        const deleted = this.keys.delete(key);
        if (deleted) this.save();
        return deleted;
    }

    /**
     * List all keys (without the full key value for security).
     */
    listKeys() {
        return Array.from(this.keys.values()).map(entry => ({
            name: entry.name,
            keyPreview: entry.key.slice(0, 12) + '...' + entry.key.slice(-4),
            guildIds: entry.guildIds,
            scopes: entry.scopes,
            createdAt: entry.createdAt,
            lastUsedAt: entry.lastUsedAt,
            requestCount: entry.requestCount
        }));
    }
}

module.exports = new ApiKeyManager();