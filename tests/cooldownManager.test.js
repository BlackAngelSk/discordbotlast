/**
 * Tests for utils/cooldownManager.js
 * Covers: getRemainingCooldown, setCooldown, getGlobalCooldown, setGlobalCooldown,
 *         resetCooldown, resetUserCooldowns, getStats, cleanup, destroy
 */
'use strict';

const assert = require('assert');
const CooldownManager = require('../utils/cooldownManager');

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

// Create a fresh manager for every group of tests to avoid state leaking
function fresh() {
    const mgr = new CooldownManager();
    // Prevent the auto-cleanup interval from hanging the process
    clearInterval(mgr.cleanupInterval);
    return mgr;
}

// ── getRemainingCooldown ───────────────────────────────────────────────────────
console.log('\ngetRemainingCooldown');

test('returns 0 when no cooldown is set', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'ping'), 0);
});

test('returns positive ms after setCooldown', () => {
    const mgr = fresh();
    mgr.setCooldown('user1', 'ping', 5000);
    const rem = mgr.getRemainingCooldown('user1', 'ping');
    assert(rem > 0 && rem <= 5000);
});

test('returns 0 and removes expired cooldown', () => {
    const mgr = fresh();
    // Set a cooldown that is already expired (negative duration)
    mgr.cooldowns.set('user1_ping', { expiresAt: Date.now() - 1 });
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'ping'), 0);
    assert(!mgr.cooldowns.has('user1_ping'));
});

test('different users have independent cooldowns', () => {
    const mgr = fresh();
    mgr.setCooldown('user1', 'roll', 10000);
    assert.strictEqual(mgr.getRemainingCooldown('user2', 'roll'), 0);
    assert(mgr.getRemainingCooldown('user1', 'roll') > 0);
});

// ── setGlobalCooldown / getGlobalCooldown ──────────────────────────────────────
console.log('\nsetGlobalCooldown / getGlobalCooldown');

test('returns 0 when no global cooldown is set', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getGlobalCooldown('user1'), 0);
});

test('returns positive ms after setGlobalCooldown', () => {
    const mgr = fresh();
    mgr.setGlobalCooldown('user1', 3000);
    const rem = mgr.getGlobalCooldown('user1');
    assert(rem > 0 && rem <= 3000);
});

test('returns 0 and removes expired global cooldown', () => {
    const mgr = fresh();
    mgr.globalCooldowns.set('user1', { expiresAt: Date.now() - 1 });
    assert.strictEqual(mgr.getGlobalCooldown('user1'), 0);
    assert(!mgr.globalCooldowns.has('user1'));
});

// ── resetCooldown ──────────────────────────────────────────────────────────────
console.log('\nresetCooldown');

test('removes an active command cooldown', () => {
    const mgr = fresh();
    mgr.setCooldown('user1', 'ping', 5000);
    mgr.resetCooldown('user1', 'ping');
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'ping'), 0);
});

test('no-op when cooldown does not exist', () => {
    const mgr = fresh();
    // Should not throw
    mgr.resetCooldown('user1', 'nonexistent');
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'nonexistent'), 0);
});

// ── resetUserCooldowns ─────────────────────────────────────────────────────────
console.log('\nresetUserCooldowns');

test('removes all cooldowns for a user', () => {
    const mgr = fresh();
    mgr.setCooldown('user1', 'ping', 5000);
    mgr.setCooldown('user1', 'roll', 3000);
    mgr.setCooldown('user2', 'ping', 5000);
    mgr.resetUserCooldowns('user1');
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'ping'), 0);
    assert.strictEqual(mgr.getRemainingCooldown('user1', 'roll'), 0);
    // user2's cooldown must survive
    assert(mgr.getRemainingCooldown('user2', 'ping') > 0);
});

// ── getStats ───────────────────────────────────────────────────────────────────
console.log('\ngetStats');

test('starts with zero counts', () => {
    const mgr = fresh();
    const s = mgr.getStats();
    assert.strictEqual(s.activeCooldowns, 0);
    assert.strictEqual(s.activeGlobalCooldowns, 0);
    assert.strictEqual(s.totalEntries, 0);
});

test('reflects added cooldowns', () => {
    const mgr = fresh();
    mgr.setCooldown('u1', 'cmd', 5000);
    mgr.setGlobalCooldown('u2', 3000);
    const s = mgr.getStats();
    assert.strictEqual(s.activeCooldowns, 1);
    assert.strictEqual(s.activeGlobalCooldowns, 1);
    assert.strictEqual(s.totalEntries, 2);
});

// ── cleanup ────────────────────────────────────────────────────────────────────
console.log('\ncleanup');

test('removes only expired entries', () => {
    const mgr = fresh();
    mgr.cooldowns.set('u1_cmd', { expiresAt: Date.now() - 100 }); // expired
    mgr.setCooldown('u2', 'cmd', 5000);                            // active
    mgr.globalCooldowns.set('u3', { expiresAt: Date.now() - 100 }); // expired
    mgr.setGlobalCooldown('u4', 5000);                              // active

    mgr.cleanup();

    assert(!mgr.cooldowns.has('u1_cmd'));
    assert(mgr.cooldowns.has('u2_cmd'));
    assert(!mgr.globalCooldowns.has('u3'));
    assert(mgr.globalCooldowns.has('u4'));
});

// ── destroy ────────────────────────────────────────────────────────────────────
console.log('\ndestroy');

test('clears all entries on destroy', () => {
    const mgr = fresh();
    mgr.setCooldown('u1', 'cmd', 5000);
    mgr.setGlobalCooldown('u1', 3000);
    mgr.destroy();
    assert.strictEqual(mgr.cooldowns.size, 0);
    assert.strictEqual(mgr.globalCooldowns.size, 0);
});

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
