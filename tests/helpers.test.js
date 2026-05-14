/**
 * Tests for utils/helpers.js
 * Covers: parseDuration, formatDuration, formatNumber,
 *         parseFlexibleDate, toDateObject, toEpochMs, formatDateLabel
 */
'use strict';

const assert = require('assert');
const {
    parseDuration,
    formatDuration,
    formatNumber,
    parseFlexibleDate,
    toDateObject,
    toEpochMs,
    formatDateLabel
} = require('../utils/helpers');

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

// ── parseDuration ──────────────────────────────────────────────────────────────
console.log('\nparseDuration');

test('parses MM:SS format', () => {
    assert.strictEqual(parseDuration('3:45'), 225);
});

test('parses HH:MM:SS format', () => {
    assert.strictEqual(parseDuration('1:02:03'), 3723);
});

test('returns 0 for empty string', () => {
    assert.strictEqual(parseDuration(''), 0);
});

test('parses "0:00" as 0 seconds', () => {
    assert.strictEqual(parseDuration('0:00'), 0);
});

test('parses large hours correctly', () => {
    assert.strictEqual(parseDuration('2:00:00'), 7200);
});

// ── formatDuration ─────────────────────────────────────────────────────────────
console.log('\nformatDuration');

test('formats seconds under an hour as MM:SS', () => {
    assert.strictEqual(formatDuration(225), '3:45');
});

test('pads seconds with leading zero', () => {
    assert.strictEqual(formatDuration(65), '1:05');
});

test('formats exactly one hour', () => {
    assert.strictEqual(formatDuration(3600), '1:00:00');
});

test('formats hours with padded minutes and seconds', () => {
    assert.strictEqual(formatDuration(3723), '1:02:03');
});

test('formats 0 seconds as "0:00"', () => {
    assert.strictEqual(formatDuration(0), '0:00');
});

test('round-trips with parseDuration (MM:SS)', () => {
    assert.strictEqual(parseDuration(formatDuration(183)), 183);
});

test('round-trips with parseDuration (HH:MM:SS)', () => {
    assert.strictEqual(parseDuration(formatDuration(7384)), 7384);
});

// ── formatNumber ───────────────────────────────────────────────────────────────
console.log('\nformatNumber');

test('returns "0" for negative input', () => {
    assert.strictEqual(formatNumber(-5), '0');
});

test('returns "0" for non-number input', () => {
    assert.strictEqual(formatNumber('abc'), '0');
});

test('returns plain string for small numbers', () => {
    assert.strictEqual(formatNumber(42), '42');
    assert.strictEqual(formatNumber(999), '999');
});

test('formats thousands with K suffix', () => {
    assert.strictEqual(formatNumber(1000), '1K');
    assert.strictEqual(formatNumber(1500), '1.5K');
    assert.strictEqual(formatNumber(10000), '10K');
});

test('formats millions with M suffix', () => {
    assert.strictEqual(formatNumber(1000000), '1M');
    assert.strictEqual(formatNumber(2500000), '2.5M');
});

test('formats billions with B suffix', () => {
    assert.strictEqual(formatNumber(1e9), '1B');
});

test('formats trillions with T suffix', () => {
    assert.strictEqual(formatNumber(1e12), '1T');
});

test('formats quadrillions with Q suffix', () => {
    assert.strictEqual(formatNumber(1e15), '1Q');
});

test('formats quintillions with Qn suffix', () => {
    assert.strictEqual(formatNumber(1e18), '1Qn');
});

test('omits decimal for values >= 100 in the tier (100K+)', () => {
    assert.strictEqual(formatNumber(100000), '100K');
    assert.strictEqual(formatNumber(123456), '123K');
});

test('returns "0" for 0', () => {
    assert.strictEqual(formatNumber(0), '0');
});

// ── parseFlexibleDate ──────────────────────────────────────────────────────────
console.log('\nparseFlexibleDate');

const MS_TIMESTAMP = 1714370400000; // 2024-04-29T10:00:00.000Z

test('returns Date from a Date object', () => {
    const d = new Date(MS_TIMESTAMP);
    const result = parseFlexibleDate(d);
    assert(result instanceof Date);
    assert.strictEqual(result.getTime(), MS_TIMESTAMP);
});

test('converts unix-second number to ms Date', () => {
    const result = parseFlexibleDate(1714370400);
    assert(result instanceof Date);
    assert.strictEqual(result.getTime(), MS_TIMESTAMP);
});

test('keeps unix-millisecond number unchanged', () => {
    const result = parseFlexibleDate(MS_TIMESTAMP);
    assert(result instanceof Date);
    assert.strictEqual(result.getTime(), MS_TIMESTAMP);
});

test('parses numeric string as unix seconds', () => {
    const result = parseFlexibleDate('1714370400');
    assert(result instanceof Date);
    assert.strictEqual(result.getTime(), MS_TIMESTAMP);
});

test('parses ISO string', () => {
    // Use the ISO representation of MS_TIMESTAMP for a self-consistent assertion
    const isoString = new Date(MS_TIMESTAMP).toISOString();
    const result = parseFlexibleDate(isoString);
    assert(result instanceof Date);
    assert.strictEqual(result.getTime(), MS_TIMESTAMP);
});

test('returns null for invalid string', () => {
    assert.strictEqual(parseFlexibleDate('not-a-date'), null);
});

test('returns null for empty string', () => {
    assert.strictEqual(parseFlexibleDate(''), null);
});

test('returns null for null input', () => {
    assert.strictEqual(parseFlexibleDate(null), null);
});

test('returns null for undefined', () => {
    assert.strictEqual(parseFlexibleDate(undefined), null);
});

test('returns null for Infinity', () => {
    assert.strictEqual(parseFlexibleDate(Infinity), null);
});

// ── toDateObject ───────────────────────────────────────────────────────────────
console.log('\ntoDateObject');

test('returns valid date for valid input', () => {
    const d = toDateObject(MS_TIMESTAMP);
    assert(d instanceof Date);
    assert.strictEqual(d.getTime(), MS_TIMESTAMP);
});

test('falls back to provided fallback ms on invalid input', () => {
    const fallback = MS_TIMESTAMP;
    const d = toDateObject('invalid', fallback);
    assert.strictEqual(d.getTime(), fallback);
});

test('falls back to new Date() when both value and fallback are invalid', () => {
    const before = Date.now();
    const d = toDateObject('bad', 'also-bad');
    const after = Date.now();
    assert(d.getTime() >= before && d.getTime() <= after);
});

// ── toEpochMs ─────────────────────────────────────────────────────────────────
console.log('\ntoEpochMs');

test('returns ms from unix second number', () => {
    assert.strictEqual(toEpochMs(1714370400, 0), MS_TIMESTAMP);
});

test('returns fallback on invalid input', () => {
    assert.strictEqual(toEpochMs('bad', MS_TIMESTAMP), MS_TIMESTAMP);
});

test('returns fallback of 0 when invalid with default fallback', () => {
    // default fallback is 0 → epoch
    assert.strictEqual(toEpochMs('bad'), 0);
});

// ── formatDateLabel ────────────────────────────────────────────────────────────
console.log('\nformatDateLabel');

test('returns fallback label for invalid date', () => {
    assert.strictEqual(formatDateLabel('nope', { fallbackLabel: 'N/A' }), 'N/A');
});

test('uses "Not available" as default fallback label', () => {
    assert.strictEqual(formatDateLabel(null), 'Not available');
});

test('returns a non-empty string for a valid date', () => {
    const label = formatDateLabel(MS_TIMESTAMP);
    assert(typeof label === 'string' && label.length > 0);
});

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
