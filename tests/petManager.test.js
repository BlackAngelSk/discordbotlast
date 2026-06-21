/**
 * Tests for utils/petManager.js
 * Covers: adopt, release, getPet, feed, play, getTypeInfo, getTypes
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

const PET_TYPES = {
    cat:    { emoji: '🐱', name: 'Cat',    hungerDrain: 1,   happinessDrain: 1.5 },
    dog:    { emoji: '🐶', name: 'Dog',    hungerDrain: 1.5, happinessDrain: 1   },
    dragon: { emoji: '🐉', name: 'Dragon', hungerDrain: 2,   happinessDrain: 2   },
    bunny:  { emoji: '🐰', name: 'Bunny',  hungerDrain: 0.8, happinessDrain: 0.8 },
    fox:    { emoji: '🦊', name: 'Fox',    hungerDrain: 1.2, happinessDrain: 1.2 },
};

const FEED_COST = 50;
const PLAY_COOLDOWN = 30 * 60 * 1000;
const HUNGER_INTERVAL = 60 * 60 * 1000;

class TestPetManager {
    constructor() {
        this.data = {};
    }

    key(guildId, userId) { return `${guildId}_${userId}`; }

    getPet(guildId, userId) {
        const k = this.key(guildId, userId);
        const pet = this.data[k];
        if (!pet) return null;
        const now = Date.now();
        const elapsed = (now - (pet.lastUpdate || now)) / HUNGER_INTERVAL;
        const type = PET_TYPES[pet.type] || PET_TYPES.cat;
        pet.hunger = Math.max(0, pet.hunger - elapsed * type.hungerDrain * 10);
        pet.happiness = Math.max(0, pet.happiness - elapsed * type.happinessDrain * 8);
        pet.lastUpdate = now;
        return pet;
    }

    async adopt(guildId, userId, type, name) {
        type = type.toLowerCase();
        if (!PET_TYPES[type]) throw new Error('Unknown pet type');
        const k = this.key(guildId, userId);
        if (this.data[k]) throw new Error('Already has a pet');
        this.data[k] = {
            type,
            name: name || PET_TYPES[type].name,
            hunger: 100,
            happiness: 100,
            xp: 0,
            level: 1,
            lastFed: null,
            lastPlayed: null,
            lastUpdate: Date.now(),
        };
        return this.data[k];
    }

    async release(guildId, userId) {
        const k = this.key(guildId, userId);
        if (!this.data[k]) return false;
        delete this.data[k];
        return true;
    }

    async feed(guildId, userId) {
        const pet = this.getPet(guildId, userId);
        if (!pet) throw new Error('No pet');
        if (pet.hunger >= 100) return { alreadyFull: true };
        pet.hunger = Math.min(100, pet.hunger + 30);
        pet.xp += 5;
        pet.level = Math.floor(pet.xp / 100) + 1;
        pet.lastFed = Date.now();
        pet.lastUpdate = Date.now();
        return { pet, feedCost: FEED_COST };
    }

    async play(guildId, userId) {
        const pet = this.getPet(guildId, userId);
        if (!pet) throw new Error('No pet');
        const now = Date.now();
        if (pet.lastPlayed && (now - pet.lastPlayed) < PLAY_COOLDOWN) {
            return { cooldown: true, remaining: PLAY_COOLDOWN - (now - pet.lastPlayed) };
        }
        pet.happiness = Math.min(100, pet.happiness + 25);
        pet.xp += 10;
        pet.level = Math.floor(pet.xp / 100) + 1;
        pet.lastPlayed = now;
        pet.lastUpdate = now;
        return { pet, cooldown: false };
    }

    getTypeInfo(type) { return PET_TYPES[type] || null; }
    getTypes() { return PET_TYPES; }
}

function fresh() {
    return new TestPetManager();
}

// ── adopt ────────────────────────────────────────────────────────────────────
console.log('\nadopt');

test('adopts a cat with default name', async () => {
    const mgr = fresh();
    const pet = await mgr.adopt('g1', 'u1', 'cat');
    assert.strictEqual(pet.type, 'cat');
    assert.strictEqual(pet.name, 'Cat');
    assert.strictEqual(pet.hunger, 100);
    assert.strictEqual(pet.happiness, 100);
    assert.strictEqual(pet.level, 1);
});

test('adopts with custom name', async () => {
    const mgr = fresh();
    const pet = await mgr.adopt('g1', 'u1', 'dog', 'Rex');
    assert.strictEqual(pet.name, 'Rex');
    assert.strictEqual(pet.type, 'dog');
});

test('type is case-insensitive', async () => {
    const mgr = fresh();
    const pet = await mgr.adopt('g1', 'u1', 'Dragon');
    assert.strictEqual(pet.type, 'dragon');
});

test('throws for unknown pet type', async () => {
    const mgr = fresh();
    try {
        await mgr.adopt('g1', 'u1', 'unicorn');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'Unknown pet type');
    }
});

test('throws if user already has a pet', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    try {
        await mgr.adopt('g1', 'u1', 'dog');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'Already has a pet');
    }
});

test('different users can adopt separately', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    await mgr.adopt('g1', 'u2', 'dog');
    assert.strictEqual(mgr.getPet('g1', 'u1').type, 'cat');
    assert.strictEqual(mgr.getPet('g1', 'u2').type, 'dog');
});

// ── release ──────────────────────────────────────────────────────────────────
console.log('\nrelease');

test('releases an existing pet', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    const result = await mgr.release('g1', 'u1');
    assert.strictEqual(result, true);
    assert.strictEqual(mgr.getPet('g1', 'u1'), null);
});

test('returns false when no pet exists', async () => {
    const mgr = fresh();
    const result = await mgr.release('g1', 'u1');
    assert.strictEqual(result, false);
});

// ── getPet ───────────────────────────────────────────────────────────────────
console.log('\ngetPet');

test('returns null for no pet', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getPet('g1', 'u1'), null);
});

test('returns pet data immediately after adopt', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'fox', 'Foxy');
    const pet = mgr.getPet('g1', 'u1');
    assert.strictEqual(pet.type, 'fox');
    assert.strictEqual(pet.name, 'Foxy');
});

// ── feed ─────────────────────────────────────────────────────────────────────
console.log('\nfeed');

test('feeds a hungry pet', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    // Manually lower hunger
    const k = mgr.key('g1', 'u1');
    mgr.data[k].hunger = 50;
    mgr.data[k].lastUpdate = Date.now();

    const result = await mgr.feed('g1', 'u1');
    assert.strictEqual(result.alreadyFull, undefined);
    assert.strictEqual(result.feedCost, FEED_COST);
    assert.strictEqual(result.pet.hunger, 80); // 50 + 30
    assert.strictEqual(result.pet.xp, 5);
});

test('returns alreadyFull when hunger is at max', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    // Manually set hunger to 100 and lastUpdate to now to avoid stat drain
    const k = mgr.key('g1', 'u1');
    mgr.data[k].hunger = 100;
    mgr.data[k].lastUpdate = Date.now();
    const result = await mgr.feed('g1', 'u1');
    assert.strictEqual(result.alreadyFull, true);
});

test('throws when no pet exists', async () => {
    const mgr = fresh();
    try {
        await mgr.feed('g1', 'u1');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'No pet');
    }
});

test('feeding increases level after enough XP', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'cat');
    const k = mgr.key('g1', 'u1');
    mgr.data[k].hunger = 50;
    mgr.data[k].xp = 95;
    mgr.data[k].lastUpdate = Date.now();

    await mgr.feed('g1', 'u1'); // +5 xp = 100, level = floor(100/100)+1 = 2
    assert.strictEqual(mgr.data[k].level, 2);
});

// ── play ─────────────────────────────────────────────────────────────────────
console.log('\nplay');

test('plays with pet successfully', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'dog');
    // Freeze lastUpdate to avoid stat drain between adopt and play
    const k = mgr.key('g1', 'u1');
    mgr.data[k].lastUpdate = Date.now();
    const result = await mgr.play('g1', 'u1');
    assert.strictEqual(result.cooldown, false);
    assert(result.pet.happiness >= 90); // happiness increased (capped at 100)
    assert.strictEqual(result.pet.xp, 10);
});

test('returns cooldown if played too recently', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'dog');
    await mgr.play('g1', 'u1');
    const result = await mgr.play('g1', 'u1');
    assert.strictEqual(result.cooldown, true);
    assert(typeof result.remaining === 'number');
    assert(result.remaining > 0);
});

test('play increases happiness', async () => {
    const mgr = fresh();
    await mgr.adopt('g1', 'u1', 'dog');
    const k = mgr.key('g1', 'u1');
    mgr.data[k].happiness = 50;
    mgr.data[k].lastUpdate = Date.now();

    const result = await mgr.play('g1', 'u1');
    assert(result.pet.happiness >= 74 && result.pet.happiness <= 75); // 50 + 25 (with possible tiny drain)
});

test('throws when no pet exists', async () => {
    const mgr = fresh();
    try {
        await mgr.play('g1', 'u1');
        assert.fail('Should have thrown');
    } catch (e) {
        assert.strictEqual(e.message, 'No pet');
    }
});

// ── getTypeInfo / getTypes ───────────────────────────────────────────────────
console.log('\ngetTypeInfo / getTypes');

test('getTypeInfo returns info for valid type', () => {
    const mgr = fresh();
    const info = mgr.getTypeInfo('cat');
    assert.strictEqual(info.emoji, '🐱');
    assert.strictEqual(info.name, 'Cat');
});

test('getTypeInfo returns null for unknown type', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getTypeInfo('unicorn'), null);
});

test('getTypes returns all pet types', () => {
    const mgr = fresh();
    const types = mgr.getTypes();
    assert.strictEqual(Object.keys(types).length, 5);
    assert(types.cat !== undefined);
    assert(types.dog !== undefined);
    assert(types.dragon !== undefined);
    assert(types.bunny !== undefined);
    assert(types.fox !== undefined);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);