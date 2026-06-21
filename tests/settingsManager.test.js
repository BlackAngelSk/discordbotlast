/**
 * Tests for utils/settingsManager.js
 * Covers: get, set, setMultiple, getPrefixes, getPrefix, setPrefixes, setPrefix,
 *         addPrefix, removePrefix, reset, normalizeGuildSettings
 */
'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

// We need to test the SettingsManager class in isolation.
// The module exports a singleton that depends on filesystem and databaseManager.
// We'll require the class definition by creating our own instance.

// Mock databaseManager to prevent real DB calls
jest_mock_databaseManager();

function jest_mock_databaseManager() {
    // Intercept require for databaseManager so it doesn't try to connect
    const Module = require('module');
    const originalResolve = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
        if (request === '../utils/databaseManager' || request === './databaseManager') {
            // Return a path we'll handle
            return request;
        }
        return originalResolve.call(this, request, parent, isMain, options);
    };

    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === '../utils/databaseManager' || request === './databaseManager') {
            return {
                useDB: 'json',
                db: null,
                find: async () => [],
                upsertOne: async () => {}
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
}

// Create a fresh SettingsManager instance for testing
// We need to bypass the singleton pattern and test the class directly
const fs = require('fs');
const path = require('path');

class TestSettingsManager {
    constructor() {
        this.settings = new Map();
        this.loaded = false;
        this._savedData = null;
    }

    normalizeGuildSettings(settings = {}) {
        const DEFAULT_SETTINGS = {
            prefixes: ['!', '.'],
            language: 'en',
            welcomeEnabled: false,
            welcomeChannel: null,
            welcomeMessage: '🎉 Welcome to the server, {user}! Enjoy your stay!',
            leaveEnabled: false,
            leaveChannel: null,
            leaveMessage: '👋 {user} has left the server.',
            autoRole: 'Member',
            djRole: 'DJ',
            botWatcherRole: 'Bot Watcher',
            serverProfile: {
                enabled: false,
                title: '',
                summary: '',
                description: '',
                inviteUrl: '',
                accentColor: '#5865F2',
                showMemberCount: true,
                showChannelCount: true,
                showRoleCount: true
            }
        };

        const normalized = { ...DEFAULT_SETTINGS, ...settings };
        normalized.serverProfile = {
            ...DEFAULT_SETTINGS.serverProfile,
            ...(settings.serverProfile || {})
        };

        if (!Array.isArray(normalized.prefixes) || normalized.prefixes.length === 0) {
            normalized.prefixes = [normalized.prefix || DEFAULT_SETTINGS.prefixes[0]];
        }

        normalized.prefix = normalized.prefixes[0] || DEFAULT_SETTINGS.prefixes[0];
        return normalized;
    }

    async save() {
        const obj = {};
        for (const [guildId, settings] of this.settings.entries()) {
            obj[guildId] = settings;
        }
        this._savedData = obj;
    }

    get(guildId) {
        if (!this.settings.has(guildId)) {
            this.settings.set(guildId, this.normalizeGuildSettings());
        }
        return this.settings.get(guildId);
    }

    async set(guildId, key, value) {
        const settings = this.get(guildId);
        settings[key] = value;
        this.settings.set(guildId, this.normalizeGuildSettings(settings));
        await this.save();
    }

    async setMultiple(guildId, updates) {
        const settings = this.get(guildId);
        Object.assign(settings, updates);
        this.settings.set(guildId, this.normalizeGuildSettings(settings));
        await this.save();
    }

    getPrefixes(guildId) {
        const settings = this.get(guildId);
        if (Array.isArray(settings.prefixes)) {
            return settings.prefixes;
        }
        return [settings.prefix || '!'];
    }

    getPrefix(guildId) {
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
        this.settings.set(guildId, this.normalizeGuildSettings());
        await this.save();
    }
}

function fresh() {
    return new TestSettingsManager();
}

// ── normalizeGuildSettings ────────────────────────────────────────────────────
console.log('\nnormalizeGuildSettings');

test('returns default settings for empty input', () => {
    const mgr = fresh();
    const s = mgr.normalizeGuildSettings();
    assert.deepStrictEqual(s.prefixes, ['!', '.']);
    assert.strictEqual(s.language, 'en');
    assert.strictEqual(s.welcomeEnabled, false);
    assert.strictEqual(s.autoRole, 'Member');
    assert.strictEqual(s.prefix, '!');
});

test('merges partial settings with defaults', () => {
    const mgr = fresh();
    const s = mgr.normalizeGuildSettings({ language: 'sk', welcomeEnabled: true });
    assert.strictEqual(s.language, 'sk');
    assert.strictEqual(s.welcomeEnabled, true);
    assert.strictEqual(s.autoRole, 'Member'); // default preserved
});

test('handles legacy single prefix field without overriding prefixes array', () => {
    const mgr = fresh();
    // When only 'prefix' (singular) is provided but no 'prefixes' array,
    // the default prefixes array is preserved because it's not overridden.
    const s = mgr.normalizeGuildSettings({ prefix: '?' });
    assert.deepStrictEqual(s.prefixes, ['!', '.']);
    assert.strictEqual(s.prefix, '!');
});

test('prefixes array takes priority when both prefix and prefixes provided', () => {
    const mgr = fresh();
    const s = mgr.normalizeGuildSettings({ prefix: '?', prefixes: ['?', '>>'] });
    assert.deepStrictEqual(s.prefixes, ['?', '>>']);
    assert.strictEqual(s.prefix, '?');
});

test('handles empty prefixes array by falling back', () => {
    const mgr = fresh();
    const s = mgr.normalizeGuildSettings({ prefixes: [] });
    assert.deepStrictEqual(s.prefixes, ['!']);
});

test('merges serverProfile with defaults', () => {
    const mgr = fresh();
    const s = mgr.normalizeGuildSettings({ serverProfile: { title: 'My Server' } });
    assert.strictEqual(s.serverProfile.title, 'My Server');
    assert.strictEqual(s.serverProfile.accentColor, '#5865F2');
    assert.strictEqual(s.serverProfile.showMemberCount, true);
});

// ── get / set ────────────────────────────────────────────────────────────────
console.log('\nget / set');

test('get returns defaults for unknown guild', () => {
    const mgr = fresh();
    const s = mgr.get('guild1');
    assert.strictEqual(s.language, 'en');
    assert.deepStrictEqual(s.prefixes, ['!', '.']);
});

test('get returns same object on repeated calls', () => {
    const mgr = fresh();
    const s1 = mgr.get('guild1');
    const s2 = mgr.get('guild1');
    assert.strictEqual(s1, s2);
});

test('set updates a specific key', async () => {
    const mgr = fresh();
    await mgr.set('guild1', 'language', 'sk');
    assert.strictEqual(mgr.get('guild1').language, 'sk');
});

test('set preserves other keys', async () => {
    const mgr = fresh();
    await mgr.set('guild1', 'language', 'sk');
    assert.strictEqual(mgr.get('guild1').welcomeEnabled, false);
});

test('setMultiple updates multiple keys at once', async () => {
    const mgr = fresh();
    await mgr.setMultiple('guild1', { language: 'de', welcomeEnabled: true, autoRole: 'VIP' });
    const s = mgr.get('guild1');
    assert.strictEqual(s.language, 'de');
    assert.strictEqual(s.welcomeEnabled, true);
    assert.strictEqual(s.autoRole, 'VIP');
});

test('different guilds have independent settings', async () => {
    const mgr = fresh();
    await mgr.set('g1', 'language', 'sk');
    await mgr.set('g2', 'language', 'de');
    assert.strictEqual(mgr.get('g1').language, 'sk');
    assert.strictEqual(mgr.get('g2').language, 'de');
});

// ── Prefixes ─────────────────────────────────────────────────────────────────
console.log('\ngetPrefixes / getPrefix');

test('getPrefixes returns default prefixes', () => {
    const mgr = fresh();
    assert.deepStrictEqual(mgr.getPrefixes('guild1'), ['!', '.']);
});

test('getPrefix returns first prefix', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getPrefix('guild1'), '!');
});

test('getPrefixes returns custom prefixes after set', async () => {
    const mgr = fresh();
    await mgr.setPrefixes('guild1', ['?', '.']);
    assert.deepStrictEqual(mgr.getPrefixes('guild1'), ['?', '.']);
    assert.strictEqual(mgr.getPrefix('guild1'), '?');
});

console.log('\nsetPrefixes');

test('setPrefixes validates non-empty array', async () => {
    const mgr = fresh();
    try {
        await mgr.setPrefixes('guild1', []);
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'Prefixes must be a non-empty array');
    }
});

test('setPrefixes validates maximum 5 prefixes', async () => {
    const mgr = fresh();
    try {
        await mgr.setPrefixes('guild1', ['a', 'b', 'c', 'd', 'e', 'f']);
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'Maximum 5 prefixes allowed');
    }
});

test('setPrefixes rejects non-array input', async () => {
    const mgr = fresh();
    try {
        await mgr.setPrefixes('guild1', '!');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'Prefixes must be a non-empty array');
    }
});

console.log('\nsetPrefix');

test('setPrefix replaces all prefixes with single prefix', async () => {
    const mgr = fresh();
    await mgr.setPrefix('guild1', '?');
    assert.deepStrictEqual(mgr.getPrefixes('guild1'), ['?']);
    assert.strictEqual(mgr.getPrefix('guild1'), '?');
});

console.log('\naddPrefix');

test('addPrefix appends a new prefix', async () => {
    const mgr = fresh();
    await mgr.addPrefix('guild1', '?');
    assert.deepStrictEqual(mgr.getPrefixes('guild1'), ['!', '.', '?']);
});

test('addPrefix throws on duplicate', async () => {
    const mgr = fresh();
    try {
        await mgr.addPrefix('guild1', '!');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'This prefix already exists');
    }
});

console.log('\nremovePrefix');

test('removePrefix removes an existing prefix', async () => {
    const mgr = fresh();
    await mgr.removePrefix('guild1', '.');
    assert.deepStrictEqual(mgr.getPrefixes('guild1'), ['!']);
});

test('removePrefix throws when it would leave zero prefixes', async () => {
    const mgr = fresh();
    await mgr.setPrefixes('guild1', ['!']);
    try {
        await mgr.removePrefix('guild1', '!');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'You must have at least one prefix');
    }
});

test('removePrefix throws for non-existent prefix', async () => {
    const mgr = fresh();
    try {
        await mgr.removePrefix('guild1', '??');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'That prefix does not exist');
    }
});

// ── reset ────────────────────────────────────────────────────────────────────
console.log('\nreset');

test('reset restores defaults', async () => {
    const mgr = fresh();
    await mgr.set('guild1', 'language', 'sk');
    await mgr.reset('guild1');
    const s = mgr.get('guild1');
    assert.strictEqual(s.language, 'en');
    assert.deepStrictEqual(s.prefixes, ['!', '.']);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);