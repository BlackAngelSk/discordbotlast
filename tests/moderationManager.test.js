/**
 * Tests for utils/moderationManager.js
 * Covers: addWarning, getWarnings, removeWarning, clearWarnings,
 *         setModLogChannel, getModLogChannel,
 *         getAutomodSettings, updateAutomodSettings,
 *         checkMessage (automod rules),
 *         addBadWord, removeBadWord
 */
'use strict';

const assert = require('assert');
const moderation = require('../utils/moderationManager');

let passed = 0;
let failed = 0;

// Silence file-system writes
moderation.save = async () => {};

function reset() {
    moderation.data = { warnings: {}, modLogs: {}, automod: {} };
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

// ── addWarning / getWarnings ───────────────────────────────────────────────────
console.log('\naddWarning / getWarnings');

(async () => {

await testAsync('addWarning returns the new warning object', async () => {
    reset();
    const w = await moderation.addWarning('g1', 'u1', 'mod1', 'test reason');
    assert(w.id);
    assert.strictEqual(w.moderatorId, 'mod1');
    assert.strictEqual(w.reason, 'test reason');
    assert(w.timestamp);
});

await testAsync('getWarnings returns all warnings for a user', async () => {
    reset();
    await moderation.addWarning('g1', 'u1', 'mod1', 'reason A');
    await moderation.addWarning('g1', 'u1', 'mod1', 'reason B');
    const warnings = moderation.getWarnings('g1', 'u1');
    assert.strictEqual(warnings.length, 2);
});

test('getWarnings returns empty array for user with no warnings', () => {
    reset();
    const warnings = moderation.getWarnings('g1', 'new-user');
    assert.deepStrictEqual(warnings, []);
});

test('warnings are scoped by guild', () => {
    reset();
    moderation.data.warnings['g1_u1'] = [{ id: 1, reason: 'g1 warn' }];
    const warns = moderation.getWarnings('g2', 'u1');
    assert.strictEqual(warns.length, 0);
});

// ── removeWarning ──────────────────────────────────────────────────────────────
console.log('\nremoveWarning');

await testAsync('removes a warning by id', async () => {
    reset();
    const w = await moderation.addWarning('g1', 'u1', 'mod1', 'remove me');
    const ok = await moderation.removeWarning('g1', 'u1', w.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(moderation.getWarnings('g1', 'u1').length, 0);
});

await testAsync('returns false for non-existent warning id', async () => {
    reset();
    const ok = await moderation.removeWarning('g1', 'u1', 9999);
    assert.strictEqual(ok, false);
});

await testAsync('returns false when user has no warnings at all', async () => {
    reset();
    const ok = await moderation.removeWarning('g1', 'ghost', 1);
    assert.strictEqual(ok, false);
});

// ── clearWarnings ──────────────────────────────────────────────────────────────
console.log('\nclearWarnings');

await testAsync('clears all warnings for a user', async () => {
    reset();
    await moderation.addWarning('g1', 'u1', 'm', 'w1');
    await moderation.addWarning('g1', 'u1', 'm', 'w2');
    await moderation.clearWarnings('g1', 'u1');
    assert.strictEqual(moderation.getWarnings('g1', 'u1').length, 0);
});

// ── setModLogChannel / getModLogChannel ────────────────────────────────────────
console.log('\nsetModLogChannel / getModLogChannel');

test('stores and retrieves mod log channel', () => {
    reset();
    moderation.setModLogChannel('g1', 'ch123');
    assert.strictEqual(moderation.getModLogChannel('g1'), 'ch123');
});

test('returns undefined for unset guild', () => {
    reset();
    assert.strictEqual(moderation.getModLogChannel('unknown'), undefined);
});

// ── getAutomodSettings ─────────────────────────────────────────────────────────
console.log('\ngetAutomodSettings');

test('returns default settings for new guild', () => {
    reset();
    const s = moderation.getAutomodSettings('g1');
    assert.strictEqual(s.enabled, false);
    assert.strictEqual(s.antiSpam, true);
    assert.strictEqual(s.antiInvite, true);
    assert.deepStrictEqual(s.badWords, []);
});

// ── updateAutomodSettings ──────────────────────────────────────────────────────
console.log('\nupdateAutomodSettings');

await testAsync('merges new settings with existing defaults', async () => {
    reset();
    await moderation.updateAutomodSettings('g1', { enabled: true, maxMentions: 3 });
    const s = moderation.getAutomodSettings('g1');
    assert.strictEqual(s.enabled, true);
    assert.strictEqual(s.maxMentions, 3);
    assert.strictEqual(s.antiSpam, true); // untouched default
});

// ── checkMessage ───────────────────────────────────────────────────────────────
console.log('\ncheckMessage (automod)');

test('no violation when automod disabled', () => {
    reset();
    const s = moderation.getAutomodSettings('g1');
    s.enabled = false;
    const r = moderation.checkMessage('g1', 'discord.gg/invite', 0);
    assert.strictEqual(r.violation, false);
});

test('detects discord.gg invite link', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true };
    const r = moderation.checkMessage('g1', 'Join us at discord.gg/test123', 0);
    assert.strictEqual(r.violation, true);
    assert(/invite/i.test(r.reason));
});

test('detects discord.com/invite link', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true };
    const r = moderation.checkMessage('g1', 'discord.com/invite/abc', 0);
    assert.strictEqual(r.violation, true);
});

test('detects bad word', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, badWords: ['badword'] };
    const r = moderation.checkMessage('g1', 'this has badword in it', 0);
    assert.strictEqual(r.violation, true);
});

test('detects obfuscated bad word', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, badWords: ['spam'] };
    // 'sp4m' → normalization converts '4' → 'a' → 'spam'
    const r = moderation.checkMessage('g1', 'sp4m', 0);
    assert.strictEqual(r.violation, true);
});

test('detects excessive mentions', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, maxMentions: 2 };
    const r = moderation.checkMessage('g1', 'hey', 3); // 3 mentions > 2
    assert.strictEqual(r.violation, true);
    assert(/mention/i.test(r.reason));
});

test('detects excessive emojis', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, maxEmojis: 2 };
    const r = moderation.checkMessage('g1', '😀😁😂🤣😃', 0); // 5 emojis > 2
    assert.strictEqual(r.violation, true);
    assert(/emoji/i.test(r.reason));
});

test('detects emoji-only message when emojiOnly enabled', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, emojiOnly: true, maxEmojis: 100 };
    const r = moderation.checkMessage('g1', '😀😁😂', 0);
    assert.strictEqual(r.violation, true);
    assert(/emoji-only/i.test(r.reason));
});

test('allows emoji-only check to pass when message has text', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true, emojiOnly: true, maxEmojis: 100 };
    const r = moderation.checkMessage('g1', 'hello 😀', 0);
    assert.strictEqual(r.violation, false);
});

test('clean message has no violation', () => {
    reset();
    moderation.data.automod['g1'] = { ...moderation.getAutomodSettings('g1'), enabled: true };
    const r = moderation.checkMessage('g1', 'Hello everyone, how are you?', 1);
    assert.strictEqual(r.violation, false);
});

// ── addBadWord / removeBadWord ─────────────────────────────────────────────────
console.log('\naddBadWord / removeBadWord');

test('addBadWord adds to list', () => {
    reset();
    moderation.addBadWord('g1', 'spam');
    assert(moderation.getAutomodSettings('g1').badWords.includes('spam'));
});

test('addBadWord does not add duplicates', () => {
    reset();
    moderation.addBadWord('g1', 'spam');
    moderation.addBadWord('g1', 'spam');
    assert.strictEqual(moderation.getAutomodSettings('g1').badWords.filter(w => w === 'spam').length, 1);
});

test('removeBadWord removes from list', () => {
    reset();
    moderation.addBadWord('g1', 'spam');
    moderation.removeBadWord('g1', 'spam');
    assert(!moderation.getAutomodSettings('g1').badWords.includes('spam'));
});

// ── Summary ────────────────────────────────────────────────────────────────────

})().then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
});
