/**
 * Tests for utils/helpers.js
 * Covers: parseDuration, formatDuration, formatNumber, parseFlexibleDate, toDateObject
 *
 * Written against the project's own runner (node tests/run-all.js), which executes
 * each *.test.js as a plain Node script – it does not provide Jest globals.
 * The previous Jest-style version of this file crashed the whole runner with
 * "ReferenceError: describe is not defined".
 */
'use strict';

const assert = require('assert');

const {
  parseDuration,
  formatDuration,
  formatNumber,
  parseFlexibleDate,
  toDateObject,
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

// ── parseDuration ────────────────────────────────────────────────────────────
console.log('\nparseDuration');

test('parses MM:SS format', () => {
  assert.strictEqual(parseDuration('3:45'), 225);
});

test('parses HH:MM:SS format', () => {
  assert.strictEqual(parseDuration('1:30:00'), 5400);
});

test('returns 0 for invalid format', () => {
  assert.strictEqual(parseDuration('invalid'), 0);
});

test('returns 0 for empty string', () => {
  assert.strictEqual(parseDuration(''), 0);
});

// ── formatDuration ───────────────────────────────────────────────────────────
console.log('\nformatDuration');

test('formats seconds to MM:SS', () => {
  assert.strictEqual(formatDuration(225), '3:45');
});

test('formats seconds to HH:MM:SS', () => {
  assert.strictEqual(formatDuration(5400), '1:30:00');
});

test('formats 0 seconds', () => {
  assert.strictEqual(formatDuration(0), '0:00');
});

// ── formatNumber ─────────────────────────────────────────────────────────────
console.log('\nformatNumber');

test('formats thousands', () => {
  assert.strictEqual(formatNumber(1500), '1.5K');
});

test('formats millions', () => {
  assert.strictEqual(formatNumber(2500000), '2.5M');
});

test('formats billions', () => {
  assert.strictEqual(formatNumber(1000000000), '1B');
});

test('formats small numbers', () => {
  assert.strictEqual(formatNumber(42), '42');
});

test('handles negative numbers', () => {
  assert.strictEqual(formatNumber(-100), '0');
});

test('handles non-number input', () => {
  assert.strictEqual(formatNumber('abc'), '0');
});

// ── parseFlexibleDate ────────────────────────────────────────────────────────
console.log('\nparseFlexibleDate');

test('parses Date object', () => {
  const date = new Date('2024-01-01');
  assert.deepStrictEqual(parseFlexibleDate(date), date);
});

test('parses timestamp number', () => {
  const timestamp = 1704067200000;
  assert.deepStrictEqual(parseFlexibleDate(timestamp), new Date(timestamp));
});

test('parses string date', () => {
  assert.ok(parseFlexibleDate('2024-01-01') instanceof Date);
});

test('returns null for invalid input', () => {
  assert.strictEqual(parseFlexibleDate(null), null);
  assert.strictEqual(parseFlexibleDate(undefined), null);
  assert.strictEqual(parseFlexibleDate(''), null);
});

// ── toDateObject ─────────────────────────────────────────────────────────────
console.log('\ntoDateObject');

test('returns Date object for valid input', () => {
  assert.ok(toDateObject('2024-01-01') instanceof Date);
});

test('returns fallback for invalid input', () => {
  assert.ok(toDateObject(null, '2024-01-01') instanceof Date);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
