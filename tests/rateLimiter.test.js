/**
 * Tests for utils/rateLimiter.js
 * Covers: checkLimit (allow / block / window-reset), reset, getStats, getOverallStats, destroy
 */
'use strict';

const assert = require('assert');
const RateLimiter = require('../utils/rateLimiter');

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

function fresh(opts = {}) {
    const rl = new RateLimiter(opts);
    clearInterval(rl.cleanupInterval);
    return rl;
}

// ── checkLimit – first request ─────────────────────────────────────────────────
console.log('\ncheckLimit – first request');

test('first request is always allowed', () => {
    const rl = fresh({ maxRequests: 3, windowMs: 60000 });
    const r = rl.checkLimit('user1');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.remaining, 2);
    assert.strictEqual(r.retryAfter, 0);
});

// ── checkLimit – within window ─────────────────────────────────────────────────
console.log('\ncheckLimit – rate limiting');

test('requests within limit are allowed', () => {
    const rl = fresh({ maxRequests: 3, windowMs: 60000 });
    rl.checkLimit('u1'); // 1st
    rl.checkLimit('u1'); // 2nd
    const r = rl.checkLimit('u1'); // 3rd = at limit
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.remaining, 0);
});

test('request exceeding limit is blocked', () => {
    const rl = fresh({ maxRequests: 2, windowMs: 60000 });
    rl.checkLimit('u1'); // 1st
    rl.checkLimit('u1'); // 2nd (at limit)
    const r = rl.checkLimit('u1'); // 3rd = over limit
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.remaining, 0);
    assert(r.retryAfter > 0);
});

test('different keys are tracked independently', () => {
    const rl = fresh({ maxRequests: 1, windowMs: 60000 });
    rl.checkLimit('u1'); // uses up u1's limit
    const r = rl.checkLimit('u2'); // u2 unaffected
    assert.strictEqual(r.allowed, true);
});

// ── checkLimit – window reset ──────────────────────────────────────────────────
console.log('\ncheckLimit – window reset');

test('resets after window expires', () => {
    const rl = fresh({ maxRequests: 1, windowMs: 60000 });
    rl.checkLimit('u1'); // 1st – uses limit
    // Manually expire the window
    const fullKey = `ratelimit_u1`;
    rl.requests.get(fullKey).resetTime = Date.now() - 1;
    const r = rl.checkLimit('u1'); // should be allowed again
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfter, 0);
});

// ── reset ──────────────────────────────────────────────────────────────────────
console.log('\nreset');

test('reset removes entry so next request is treated as first', () => {
    const rl = fresh({ maxRequests: 1, windowMs: 60000 });
    rl.checkLimit('u1'); // uses limit
    rl.reset('u1');
    const r = rl.checkLimit('u1');
    assert.strictEqual(r.allowed, true);
});

test('reset on non-existent key is a no-op', () => {
    const rl = fresh({ maxRequests: 2, windowMs: 60000 });
    rl.reset('unknown'); // should not throw
    assert.strictEqual(rl.requests.size, 0);
});

// ── getStats ───────────────────────────────────────────────────────────────────
console.log('\ngetStats');

test('returns count 0 for unseen key', () => {
    const rl = fresh();
    const s = rl.getStats('newKey');
    assert.strictEqual(s.count, 0);
});

test('returns current count after requests', () => {
    const rl = fresh({ maxRequests: 5, windowMs: 60000 });
    rl.checkLimit('u1');
    rl.checkLimit('u1');
    const s = rl.getStats('u1');
    assert.strictEqual(s.count, 2);
});

// ── getOverallStats ────────────────────────────────────────────────────────────
console.log('\ngetOverallStats');

test('returns configured limits in overall stats', () => {
    const rl = fresh({ maxRequests: 7, windowMs: 30000 });
    const s = rl.getOverallStats();
    assert.strictEqual(s.maxRequests, 7);
    assert.strictEqual(s.windowMs, 30000);
    assert.strictEqual(s.activeKeys, 0);
});

test('activeKeys increases after new requests', () => {
    const rl = fresh({ maxRequests: 3, windowMs: 60000 });
    rl.checkLimit('u1');
    rl.checkLimit('u2');
    assert.strictEqual(rl.getOverallStats().activeKeys, 2);
});

// ── cleanup ────────────────────────────────────────────────────────────────────
console.log('\ncleanup');

test('removes expired entries', () => {
    const rl = fresh({ maxRequests: 5, windowMs: 60000 });
    rl.checkLimit('u1');
    // Expire the window manually
    rl.requests.get('ratelimit_u1').resetTime = Date.now() - 1;
    rl.cleanup();
    assert.strictEqual(rl.requests.size, 0);
});

test('keeps non-expired entries', () => {
    const rl = fresh({ maxRequests: 5, windowMs: 60000 });
    rl.checkLimit('u1');
    rl.cleanup(); // window is still active
    assert.strictEqual(rl.requests.size, 1);
});

// ── destroy ────────────────────────────────────────────────────────────────────
console.log('\ndestroy');

test('clears all entries on destroy', () => {
    const rl = fresh({ maxRequests: 3, windowMs: 60000 });
    rl.checkLimit('u1');
    rl.checkLimit('u2');
    rl.destroy();
    assert.strictEqual(rl.requests.size, 0);
});

// ── custom keyPrefix ───────────────────────────────────────────────────────────
console.log('\ncustom keyPrefix');

test('keys are namespaced by keyPrefix', () => {
    const rl = fresh({ maxRequests: 2, windowMs: 60000, keyPrefix: 'cmd' });
    rl.checkLimit('u1');
    assert(rl.requests.has('cmd_u1'));
});

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
