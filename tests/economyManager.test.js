/**
 * Tests for utils/economyManager.js
 *
 * The module exports a singleton EconomyManager instance.
 * We reset its in-memory data before each logical section and stub
 * `save()` so no files are touched during the tests.
 */
'use strict';

const assert = require('assert');
const economy = require('../utils/economyManager');

let passed = 0;
let failed = 0;

// Silence file-system writes for all tests
economy.save = async () => {};

function reset() {
    economy.data = { users: {}, shops: {} };
    economy.xpEvents = new Map();
}

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

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

// ── getUserKey ─────────────────────────────────────────────────────────────────
console.log('\ngetUserKey');

test('converts userId to string', () => {
    assert.strictEqual(economy.getUserKey(123), '123');
    assert.strictEqual(economy.getUserKey('abc'), 'abc');
});

// ── getUserData ────────────────────────────────────────────────────────────────
console.log('\ngetUserData');

test('creates default data for new user', () => {
    reset();
    const d = economy.getUserData('guild1', 'user1');
    assert.strictEqual(d.balance, 0);
    assert.strictEqual(d.xp, 0);
    assert.strictEqual(d.level, 1);
    assert.deepStrictEqual(d.inventory, []);
});

test('attaches guildId to guilds list', () => {
    reset();
    economy.getUserData('guild1', 'user1');
    assert(economy.data.users['user1'].guilds.includes('guild1'));
});

test('returns same object on repeated calls', () => {
    reset();
    const d1 = economy.getUserData('g1', 'u1');
    d1.balance = 500;
    const d2 = economy.getUserData('g1', 'u1');
    assert.strictEqual(d2.balance, 500);
});

// ── normalizeUserData ──────────────────────────────────────────────────────────
console.log('\nnormalizeUserData');

test('fills missing fields with defaults', () => {
    reset();
    const d = economy.normalizeUserData({});
    assert.strictEqual(d.balance, 0);
    assert.deepStrictEqual(d.inventory, []);
    assert.strictEqual(d.level, 1);
});

test('clamps negative xp to 0', () => {
    reset();
    const d = economy.normalizeUserData({ xp: -50 });
    assert.strictEqual(d.xp, 0);
});

test('deduplicates guilds list', () => {
    reset();
    const d = economy.normalizeUserData({ guilds: ['g1', 'g1', 'g2'] });
    assert.strictEqual(d.guilds.length, 2);
});

test('highestLevelReached is always >= level', () => {
    reset();
    const d = economy.normalizeUserData({ xp: 10000, level: 1, highestLevelReached: 1 });
    assert(d.highestLevelReached >= d.level);
});

// ── addMoney / removeMoney ─────────────────────────────────────────────────────
console.log('\naddMoney / removeMoney');

(async () => {

await testAsync('addMoney increases balance', async () => {
    reset();
    const newBal = await economy.addMoney('g1', 'u1', 500);
    assert.strictEqual(newBal, 500);
});

await testAsync('addMoney accumulates', async () => {
    reset();
    await economy.addMoney('g1', 'u1', 300);
    const newBal = await economy.addMoney('g1', 'u1', 200);
    assert.strictEqual(newBal, 500);
});

await testAsync('removeMoney succeeds when balance is sufficient', async () => {
    reset();
    await economy.addMoney('g1', 'u1', 1000);
    const ok = await economy.removeMoney('g1', 'u1', 400);
    assert.strictEqual(ok, true);
    assert.strictEqual(economy.getUserData('g1', 'u1').balance, 600);
});

await testAsync('removeMoney fails when balance is insufficient', async () => {
    reset();
    await economy.addMoney('g1', 'u1', 100);
    const ok = await economy.removeMoney('g1', 'u1', 200);
    assert.strictEqual(ok, false);
    assert.strictEqual(economy.getUserData('g1', 'u1').balance, 100);
});

// ── addXP / level-up ──────────────────────────────────────────────────────────
console.log('\naddXP / level-up');

await testAsync('addXP increases xp', async () => {
    reset();
    await economy.addXP('g1', 'u1', 50);
    assert.strictEqual(economy.getUserData('g1', 'u1').xp, 50);
});

await testAsync('addXP reports leveledUp when threshold crossed', async () => {
    reset();
    // Level 2 requires xp >= (2-1)^2 * 100 = 100 xp
    const result = await economy.addXP('g1', 'u1', 100);
    assert.strictEqual(result.leveledUp, true);
    assert(result.level >= 2);
});

await testAsync('addXP reports leveledUp=false when threshold not crossed', async () => {
    reset();
    const result = await economy.addXP('g1', 'u1', 10);
    assert.strictEqual(result.leveledUp, false);
});

// ── setBalance / addBalance / removeBalance ────────────────────────────────────
console.log('\nsetBalance / addBalance / removeBalance');

await testAsync('setBalance sets exact amount', async () => {
    reset();
    const b = await economy.setBalance('g1', 'u1', 9999);
    assert.strictEqual(b, 9999);
});

await testAsync('addBalance adds to existing balance', async () => {
    reset();
    await economy.setBalance('g1', 'u1', 100);
    const b = await economy.addBalance('g1', 'u1', 50);
    assert.strictEqual(b, 150);
});

await testAsync('removeBalance clamps to 0', async () => {
    reset();
    await economy.setBalance('g1', 'u1', 10);
    const b = await economy.removeBalance('g1', 'u1', 100);
    assert.strictEqual(b, 0);
});

// ── claimDaily ─────────────────────────────────────────────────────────────────
console.log('\nclaimDaily');

await testAsync('first daily claim succeeds', async () => {
    reset();
    const r = await economy.claimDaily('g1', 'u1');
    assert.strictEqual(r.success, true);
    assert(r.amount >= 1000);
    assert.strictEqual(r.streak, 1);
});

await testAsync('second daily within 24h is rejected', async () => {
    reset();
    await economy.claimDaily('g1', 'u1');
    const r = await economy.claimDaily('g1', 'u1');
    assert.strictEqual(r.success, false);
    assert(r.timeLeft > 0);
});

await testAsync('streak increments on consecutive days', async () => {
    reset();
    const now = Date.now();
    const ud = economy.getUserData('g1', 'u1');
    // Simulate an existing streak of 1 with lastDaily 25 hours ago (within 48h window)
    ud.dailyStreak = 1;
    ud.lastDaily = now - 25 * 60 * 60 * 1000;
    const r = await economy.claimDaily('g1', 'u1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.streak, 2);
});

await testAsync('streak resets after 48h gap', async () => {
    reset();
    const now = Date.now();
    economy.getUserData('g1', 'u1').lastDaily = now - 49 * 60 * 60 * 1000;
    economy.getUserData('g1', 'u1').dailyStreak = 5;
    const r = await economy.claimDaily('g1', 'u1');
    assert.strictEqual(r.streak, 1);
});

await testAsync('streak multiplier caps at 3x', async () => {
    reset();
    const ud = economy.getUserData('g1', 'u1');
    ud.dailyStreak = 20;
    // Simulate lastDaily 25h ago so streak continues
    ud.lastDaily = Date.now() - 25 * 60 * 60 * 1000;
    const r = await economy.claimDaily('g1', 'u1');
    assert(r.multiplier <= 3);
});

// ── claimWeekly ────────────────────────────────────────────────────────────────
console.log('\nclaimWeekly');

await testAsync('first weekly claim succeeds with 5000', async () => {
    reset();
    const r = await economy.claimWeekly('g1', 'u1');
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.amount, 5000);
});

await testAsync('second weekly within 7 days is rejected', async () => {
    reset();
    await economy.claimWeekly('g1', 'u1');
    const r = await economy.claimWeekly('g1', 'u1');
    assert.strictEqual(r.success, false);
    assert(r.timeLeft > 0);
});

// ── shop operations ────────────────────────────────────────────────────────────
console.log('\nshop operations');

test('getShopItems returns default items for new guild', () => {
    reset();
    const items = economy.getShopItems('g1');
    assert(Array.isArray(items));
    assert(items.length > 0);
});

await testAsync('addShopItem adds a custom item', async () => {
    reset();
    await economy.addShopItem('g1', { id: 'sword', name: 'Sword', price: 500, type: 'item' });
    const items = economy.getShopItems('g1');
    assert(items.some(i => i.id === 'sword'));
});

await testAsync('removeShopItem removes existing item', async () => {
    reset();
    await economy.addShopItem('g1', { id: 'shield', name: 'Shield', price: 300, type: 'item' });
    const removed = await economy.removeShopItem('g1', 'shield');
    assert.strictEqual(removed, true);
    assert(!economy.getShopItems('g1').some(i => i.id === 'shield'));
});

await testAsync('removeShopItem returns false for missing item', async () => {
    reset();
    const removed = await economy.removeShopItem('g1', 'ghost-item');
    assert.strictEqual(removed, false);
});

// ── getLeaderboard ─────────────────────────────────────────────────────────────
console.log('\ngetLeaderboard');

test('returns top users sorted by balance', () => {
    reset();
    economy.data.users['u1'] = { balance: 100, xp: 0, level: 1, highestLevelReached: 1, guilds: ['g1'], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    economy.data.users['u2'] = { balance: 500, xp: 0, level: 1, highestLevelReached: 1, guilds: ['g1'], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    economy.data.users['u3'] = { balance: 200, xp: 0, level: 1, highestLevelReached: 1, guilds: ['g1'], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    const lb = economy.getLeaderboard('g1', 'balance', 3);
    assert.strictEqual(lb[0].userId, 'u2');
    assert.strictEqual(lb[1].userId, 'u3');
    assert.strictEqual(lb[2].userId, 'u1');
});

test('limit is respected', () => {
    reset();
    for (let i = 0; i < 10; i++) {
        economy.data.users[`u${i}`] = { balance: i * 100, xp: 0, level: 1, highestLevelReached: 1, guilds: [], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    }
    const lb = economy.getLeaderboard(null, 'balance', 5);
    assert.strictEqual(lb.length, 5);
});

test('invalid leaderboard type falls back to balance', () => {
    reset();
    economy.data.users['u1'] = { balance: 999, xp: 0, level: 1, highestLevelReached: 1, guilds: [], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    const lb = economy.getLeaderboard(null, '__proto__', 10);
    assert(lb.length > 0);
    assert(lb[0].balance !== undefined);
});

// ── XP events ──────────────────────────────────────────────────────────────────
console.log('\nXP events');

test('getXPMultiplier returns 1 when no event active', () => {
    reset();
    assert.strictEqual(economy.getXPMultiplier('g1'), 1);
});

test('startXPEvent sets multiplier', () => {
    reset();
    economy.startXPEvent('g1', 2.5, 60000);
    assert.strictEqual(economy.getXPMultiplier('g1'), 2.5);
});

test('stopXPEvent removes event', () => {
    reset();
    economy.startXPEvent('g1', 2, 60000);
    economy.stopXPEvent('g1');
    assert.strictEqual(economy.getXPMultiplier('g1'), 1);
});

test('getXPEvent returns null after expiry', () => {
    reset();
    economy.xpEvents.set('g1', { multiplier: 3, endsAt: Date.now() - 1 });
    assert.strictEqual(economy.getXPEvent('g1'), null);
});

// ── migrateToGlobalUsers ───────────────────────────────────────────────────────
console.log('\nmigrateToGlobalUsers');

test('merges legacy guildId_userId keys into global user records', () => {
    reset();
    economy.data.users = {
        'g1_u1': { balance: 300, xp: 0, level: 1, highestLevelReached: 1, guilds: [], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 },
        'g2_u1': { balance: 200, xp: 0, level: 1, highestLevelReached: 1, guilds: [], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 }
    };
    const changed = economy.migrateToGlobalUsers();
    assert.strictEqual(changed, true);
    // Both legacy keys should be merged into single 'u1' record
    assert(economy.data.users['u1']);
    assert.strictEqual(economy.data.users['u1'].balance, 500);
});

test('returns false when no legacy keys exist', () => {
    reset();
    economy.data.users['u1'] = { balance: 100, xp: 0, level: 1, highestLevelReached: 1, guilds: ['g1'], inventory: [], dailyStreak: 0, streakBonusMultiplier: 1, seasonalCoins: 0 };
    const changed = economy.migrateToGlobalUsers();
    assert.strictEqual(changed, false);
});

// ── mergeUserData ──────────────────────────────────────────────────────────────
console.log('\nmergeUserData');

test('sums balance and xp', () => {
    reset();
    const merged = economy.mergeUserData({ balance: 100, xp: 50 }, { balance: 200, xp: 30 });
    assert.strictEqual(merged.balance, 300);
    assert.strictEqual(merged.xp, 80);
});

test('takes max level', () => {
    reset();
    const merged = economy.mergeUserData({ level: 5 }, { level: 10 });
    assert(merged.level >= 10);
});

test('deduplicates inventory', () => {
    reset();
    const merged = economy.mergeUserData({ inventory: ['a', 'b'] }, { inventory: ['b', 'c'] });
    assert.deepStrictEqual([...new Set(merged.inventory)].sort(), merged.inventory.slice().sort());
    assert.strictEqual(merged.inventory.length, 3);
});

// ── addItem ────────────────────────────────────────────────────────────────────
console.log('\naddItem');

await testAsync('adds item to user inventory', async () => {
    reset();
    await economy.addItem('g1', 'u1', 'sword');
    const d = economy.getUserData('g1', 'u1');
    assert(d.inventory.includes('sword'));
});

// ── Summary ────────────────────────────────────────────────────────────────────

})().then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
});
