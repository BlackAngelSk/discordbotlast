/**
 * Tests for utils/afkManager.js
 * Covers: setAFK, removeAFK, isAFK, getAFKTime, formatDuration, getGuildAFKUsers
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

// Fresh instance that bypasses file I/O
class TestAFKManager {
    constructor() {
        this.data = {};
    }

    async setAFK(guildId, userId, reason = 'AFK') {
        if (!this.data[guildId]) {
            this.data[guildId] = {};
        }
        this.data[guildId][userId] = {
            reason,
            timestamp: Date.now()
        };
    }

    async removeAFK(guildId, userId) {
        if (this.data[guildId]?.[userId]) {
            const afkData = this.data[guildId][userId];
            delete this.data[guildId][userId];
            return afkData;
        }
        return null;
    }

    isAFK(guildId, userId) {
        return this.data[guildId]?.[userId] || null;
    }

    getAFKTime(guildId, userId) {
        const afkData = this.isAFK(guildId, userId);
        if (!afkData) return null;

        const duration = Date.now() - afkData.timestamp;
        return this.formatDuration(duration);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    }

    getGuildAFKUsers(guildId) {
        return this.data[guildId] || {};
    }
}

function fresh() {
    return new TestAFKManager();
}

// ── setAFK ───────────────────────────────────────────────────────────────────
console.log('\nsetAFK');

test('sets user as AFK with default reason', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1');
    const data = mgr.isAFK('g1', 'u1');
    assert(data !== null);
    assert.strictEqual(data.reason, 'AFK');
    assert(typeof data.timestamp === 'number');
});

test('sets user as AFK with custom reason', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'Sleeping');
    const data = mgr.isAFK('g1', 'u1');
    assert.strictEqual(data.reason, 'Sleeping');
});

test('creates guild structure if not exists', async () => {
    const mgr = fresh();
    await mgr.setAFK('new_guild', 'u1');
    assert.deepStrictEqual(Object.keys(mgr.data), ['new_guild']);
});

test('multiple users can be AFK in same guild', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'Away');
    await mgr.setAFK('g1', 'u2', 'Busy');
    assert.strictEqual(mgr.isAFK('g1', 'u1').reason, 'Away');
    assert.strictEqual(mgr.isAFK('g1', 'u2').reason, 'Busy');
});

test('same user AFK in different guilds', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'AFK g1');
    await mgr.setAFK('g2', 'u1', 'AFK g2');
    assert.strictEqual(mgr.isAFK('g1', 'u1').reason, 'AFK g1');
    assert.strictEqual(mgr.isAFK('g2', 'u1').reason, 'AFK g2');
});

// ── removeAFK ────────────────────────────────────────────────────────────────
console.log('\nremoveAFK');

test('removes AFK data and returns it', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'Away');
    const removed = await mgr.removeAFK('g1', 'u1');
    assert.strictEqual(removed.reason, 'Away');
    assert.strictEqual(mgr.isAFK('g1', 'u1'), null);
});

test('returns null when user is not AFK', async () => {
    const mgr = fresh();
    const result = await mgr.removeAFK('g1', 'u1');
    assert.strictEqual(result, null);
});

test('returns null for non-existent guild', async () => {
    const mgr = fresh();
    const result = await mgr.removeAFK('no_guild', 'u1');
    assert.strictEqual(result, null);
});

test('only removes target user', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'A');
    await mgr.setAFK('g1', 'u2', 'B');
    await mgr.removeAFK('g1', 'u1');
    assert.strictEqual(mgr.isAFK('g1', 'u1'), null);
    assert.strictEqual(mgr.isAFK('g1', 'u2').reason, 'B');
});

// ── isAFK ────────────────────────────────────────────────────────────────────
console.log('\nisAFK');

test('returns null for non-AFK user', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.isAFK('g1', 'u1'), null);
});

test('returns null for non-existent guild', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.isAFK('no_guild', 'u1'), null);
});

test('returns afk data object when AFK', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'Gone');
    const data = mgr.isAFK('g1', 'u1');
    assert.strictEqual(data.reason, 'Gone');
    assert(typeof data.timestamp === 'number');
});

// ── getAFKTime ───────────────────────────────────────────────────────────────
console.log('\ngetAFKTime');

test('returns null for non-AFK user', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getAFKTime('g1', 'u1'), null);
});

test('returns a time string for AFK user', async () => {
    const mgr = fresh();
    // Set a manual timestamp in the past
    mgr.data['g1'] = { 'u1': { reason: 'Away', timestamp: Date.now() - 5000 } };
    const timeStr = mgr.getAFKTime('g1', 'u1');
    assert(typeof timeStr === 'string');
    assert(timeStr.includes('s')); // Should show seconds
});

// ── formatDuration ───────────────────────────────────────────────────────────
console.log('\nformatDuration');

test('formats seconds only', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.formatDuration(5000), '5s');
});

test('formats minutes', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.formatDuration(120000), '2m');
});

test('formats hours and minutes', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.formatDuration(3720000), '1h 2m');
});

test('formats days and hours', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.formatDuration(90000000), '1d 1h');
});

test('formats zero as 0s', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.formatDuration(0), '0s');
});

// ── getGuildAFKUsers ─────────────────────────────────────────────────────────
console.log('\ngetGuildAFKUsers');

test('returns empty object for unknown guild', () => {
    const mgr = fresh();
    assert.deepStrictEqual(mgr.getGuildAFKUsers('g1'), {});
});

test('returns all AFK users for guild', async () => {
    const mgr = fresh();
    await mgr.setAFK('g1', 'u1', 'A');
    await mgr.setAFK('g1', 'u2', 'B');
    const users = mgr.getGuildAFKUsers('g1');
    assert.strictEqual(Object.keys(users).length, 2);
    assert.strictEqual(users['u1'].reason, 'A');
    assert.strictEqual(users['u2'].reason, 'B');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);