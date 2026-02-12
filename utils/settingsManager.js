const fs = require('fs').promises;
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

// Default settings for new servers
const DEFAULT_SETTINGS = {
    prefixes: ['!', '.'],  // Support 2 prefixes
    language: 'en',  // Default language
    welcomeEnabled: false,
    welcomeChannel: null,
    welcomeMessage: '🎉 Welcome to the server, {user}! Enjoy your stay!',
    leaveEnabled: false,
    leaveChannel: null,
    leaveMessage: '👋 {user} has left the server.',
    autoRole: 'Member',
    djRole: 'DJ'
};

class SettingsManager {
    constructor() {
        this.settings = new Map();
        this.loaded = false;
    }

    async init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(SETTINGS_FILE);
            await fs.mkdir(dataDir, { recursive: true });

            // Load settings from file
            try {
                const data = await fs.readFile(SETTINGS_FILE, 'utf8');
                const parsed = JSON.parse(data);
                
                // Convert object to Map
                for (const [guildId, settings] of Object.entries(parsed)) {
                    this.settings.set(guildId, { ...DEFAULT_SETTINGS, ...settings });
                }
                
                console.log(`✅ Loaded settings for ${this.settings.size} server(s)`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error loading settings:', error);
                }
                // File doesn't exist yet, that's okay
            }

            this.loaded = true;
        } catch (error) {
            console.error('Failed to initialize settings manager:', error);
        }
    }

    async save() {
        try {
            // Convert Map to object
            const obj = {};
            for (const [guildId, settings] of this.settings.entries()) {
                obj[guildId] = settings;
            }

            await fs.writeFile(SETTINGS_FILE, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    get(guildId) {
        if (!this.settings.has(guildId)) {
            this.settings.set(guildId, { ...DEFAULT_SETTINGS });
        }
        return this.settings.get(guildId);
    }

    async set(guildId, key, value) {
        const settings = this.get(guildId);
        settings[key] = value;
        this.settings.set(guildId, settings);
        await this.save();
    }

    async setMultiple(guildId, updates) {
        const settings = this.get(guildId);
        Object.assign(settings, updates);
        this.settings.set(guildId, settings);
        await this.save();
    }

    getPrefixes(guildId) {
        const settings = this.get(guildId);
        // Support both old single prefix and new array of prefixes
        if (Array.isArray(settings.prefixes)) {
            return settings.prefixes;
        }
        // Fallback for old data format
        return [settings.prefix || '!'];
    }

    getPrefix(guildId) {
        // For backwards compatibility, return first prefix
        const prefixes = this.getPrefixes(guildId);
        return prefixes[0] || '!';
    }

    async setPrefixes(guildId, prefixes) {
        if (!Array.isArray(prefixes) || prefixes.length === 0) {
            throw new Error('Prefixes must be a non-empty array');
        }
        if (prefixes.length > 5) {
            throw new Error('Maximum 5 prefixes allowed');
        }
        await this.set(guildId, 'prefixes', prefixes);
    }

    async setPrefix(guildId, prefix) {
        // Set single prefix (replaces all)
        await this.setPrefixes(guildId, [prefix]);
    }

    async addPrefix(guildId, prefix) {
        const prefixes = this.getPrefixes(guildId);
        if (prefixes.includes(prefix)) {
            throw new Error('This prefix already exists');
        }
        prefixes.push(prefix);
        await this.setPrefixes(guildId, prefixes);
    }

    async removePrefix(guildId, prefix) {
        const prefixes = this.getPrefixes(guildId);
        if (prefixes.length === 1) {
            throw new Error('You must have at least one prefix');
        }
        const filtered = prefixes.filter(p => p !== prefix);
        if (filtered.length === prefixes.length) {
            throw new Error('That prefix does not exist');
        }
        await this.setPrefixes(guildId, filtered);
    }

    async reset(guildId) {
        this.settings.set(guildId, { ...DEFAULT_SETTINGS });
        await this.save();
    }
}

// Export singleton instance
const settingsManager = new SettingsManager();
module.exports = settingsManager;
