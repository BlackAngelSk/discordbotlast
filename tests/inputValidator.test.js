/**
 * Tests for utils/inputValidator.js
 * Covers all static methods of InputValidator.
 */
'use strict';

const assert = require('assert');
const InputValidator = require('../utils/inputValidator');

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

// ── validateString ─────────────────────────────────────────────────────────────
console.log('\nvalidateString');

test('valid string passes', () => {
    const r = InputValidator.validateString('hello');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, 'hello');
});

test('trims whitespace by default', () => {
    const r = InputValidator.validateString('  hi  ');
    assert.strictEqual(r.value, 'hi');
});

test('required=true rejects falsy input', () => {
    const r = InputValidator.validateString('', { required: true });
    assert.strictEqual(r.valid, false);
});

test('required=false allows empty string', () => {
    const r = InputValidator.validateString('', { required: false });
    assert.strictEqual(r.valid, true);
});

test('minLength constraint enforced', () => {
    const r = InputValidator.validateString('hi', { minLength: 5 });
    assert.strictEqual(r.valid, false);
});

test('maxLength constraint enforced', () => {
    const r = InputValidator.validateString('hello world', { maxLength: 5 });
    assert.strictEqual(r.valid, false);
});

test('allowSpecialChars=false rejects < > @ # & *', () => {
    const r = InputValidator.validateString('hello@world', { allowSpecialChars: false });
    assert.strictEqual(r.valid, false);
});

test('allowSpecialChars=true allows special chars', () => {
    const r = InputValidator.validateString('hello@world', { allowSpecialChars: true });
    assert.strictEqual(r.valid, true);
});

// ── validateNumber ─────────────────────────────────────────────────────────────
console.log('\nvalidateNumber');

test('valid integer passes', () => {
    const r = InputValidator.validateNumber(42);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, 42);
});

test('valid string number passes', () => {
    const r = InputValidator.validateNumber('3.14');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, 3.14);
});

test('NaN string rejected', () => {
    const r = InputValidator.validateNumber('abc');
    assert.strictEqual(r.valid, false);
});

test('null with required=true rejected', () => {
    const r = InputValidator.validateNumber(null, { required: true });
    assert.strictEqual(r.valid, false);
});

test('null with required=false returns null value', () => {
    const r = InputValidator.validateNumber(null, { required: false });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, null);
});

test('min constraint enforced', () => {
    const r = InputValidator.validateNumber(3, { min: 5 });
    assert.strictEqual(r.valid, false);
});

test('max constraint enforced', () => {
    const r = InputValidator.validateNumber(10, { max: 5 });
    assert.strictEqual(r.valid, false);
});

test('integer=true rejects float', () => {
    const r = InputValidator.validateNumber(3.5, { integer: true });
    assert.strictEqual(r.valid, false);
});

test('integer=true accepts whole number', () => {
    const r = InputValidator.validateNumber(3, { integer: true });
    assert.strictEqual(r.valid, true);
});

test('empty string with required=true rejected', () => {
    const r = InputValidator.validateNumber('', { required: true });
    assert.strictEqual(r.valid, false);
});

// ── validateBoolean ────────────────────────────────────────────────────────────
console.log('\nvalidateBoolean');

test('true boolean', () => {
    const r = InputValidator.validateBoolean(true);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, true);
});

test('false boolean', () => {
    const r = InputValidator.validateBoolean(false);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, false);
});

test('"true" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('true').value, true);
});

test('"yes" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('yes').value, true);
});

test('"1" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('1').value, true);
});

test('"on" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('on').value, true);
});

test('"false" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('false').value, false);
});

test('"no" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('no').value, false);
});

test('"0" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('0').value, false);
});

test('"off" string', () => {
    assert.strictEqual(InputValidator.validateBoolean('off').value, false);
});

test('invalid string rejected', () => {
    const r = InputValidator.validateBoolean('maybe');
    assert.strictEqual(r.valid, false);
});

// ── validateArray ──────────────────────────────────────────────────────────────
console.log('\nvalidateArray');

test('valid array passes', () => {
    const r = InputValidator.validateArray([1, 2, 3]);
    assert.strictEqual(r.valid, true);
});

test('non-array with required=true rejected', () => {
    const r = InputValidator.validateArray('not-array', { required: true });
    assert.strictEqual(r.valid, false);
});

test('non-array with required=false returns empty array', () => {
    const r = InputValidator.validateArray(null, { required: false });
    assert.strictEqual(r.valid, true);
    assert.deepStrictEqual(r.value, []);
});

test('minLength constraint enforced', () => {
    const r = InputValidator.validateArray([1], { minLength: 3 });
    assert.strictEqual(r.valid, false);
});

test('maxLength constraint enforced', () => {
    const r = InputValidator.validateArray([1, 2, 3, 4], { maxLength: 2 });
    assert.strictEqual(r.valid, false);
});

test('itemValidator validates each item', () => {
    const itemValidator = (item) =>
        typeof item === 'number' ? { valid: true } : { valid: false, error: 'not a number' };
    const r = InputValidator.validateArray([1, 'oops', 3], { itemValidator });
    assert.strictEqual(r.valid, false);
    assert(r.error.includes('index 1'));
});

test('itemValidator passes when all items valid', () => {
    const itemValidator = (item) => ({ valid: true, value: item });
    const r = InputValidator.validateArray([1, 2, 3], { itemValidator });
    assert.strictEqual(r.valid, true);
});

// ── validateEmail ──────────────────────────────────────────────────────────────
console.log('\nvalidateEmail');

test('valid email', () => {
    const r = InputValidator.validateEmail('user@example.com');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, 'user@example.com');
});

test('email is lowercased', () => {
    const r = InputValidator.validateEmail('USER@EXAMPLE.COM');
    assert.strictEqual(r.value, 'user@example.com');
});

test('missing @ rejected', () => {
    const r = InputValidator.validateEmail('userexample.com');
    assert.strictEqual(r.valid, false);
});

test('empty input rejected', () => {
    const r = InputValidator.validateEmail('');
    assert.strictEqual(r.valid, false);
});

test('email over 254 chars rejected', () => {
    const long = 'a'.repeat(250) + '@b.com'; // 256 chars > 254
    const r = InputValidator.validateEmail(long);
    assert.strictEqual(r.valid, false);
});

test('email with spaces rejected', () => {
    const r = InputValidator.validateEmail('user @example.com');
    assert.strictEqual(r.valid, false);
});

// ── validateURL ────────────────────────────────────────────────────────────────
console.log('\nvalidateURL');

test('valid http URL passes', () => {
    const r = InputValidator.validateURL('http://example.com');
    assert.strictEqual(r.valid, true);
});

test('valid https URL passes', () => {
    const r = InputValidator.validateURL('https://example.com/path?q=1');
    assert.strictEqual(r.valid, true);
});

test('plain hostname without protocol rejected', () => {
    const r = InputValidator.validateURL('example.com');
    assert.strictEqual(r.valid, false);
});

test('empty input rejected', () => {
    const r = InputValidator.validateURL('');
    assert.strictEqual(r.valid, false);
});

test('random string rejected', () => {
    const r = InputValidator.validateURL('not a url');
    assert.strictEqual(r.valid, false);
});

// ── validateDiscordId ──────────────────────────────────────────────────────────
console.log('\nvalidateDiscordId');

test('valid 17-digit ID', () => {
    const r = InputValidator.validateDiscordId('12345678901234567');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, '12345678901234567');
});

test('valid 18-digit ID', () => {
    const r = InputValidator.validateDiscordId('123456789012345678');
    assert.strictEqual(r.valid, true);
});

test('valid 19-digit ID', () => {
    const r = InputValidator.validateDiscordId('1234567890123456789');
    assert.strictEqual(r.valid, true);
});

test('16-digit ID rejected (too short)', () => {
    const r = InputValidator.validateDiscordId('1234567890123456');
    assert.strictEqual(r.valid, false);
});

test('20-digit ID rejected (too long)', () => {
    const r = InputValidator.validateDiscordId('12345678901234567890');
    assert.strictEqual(r.valid, false);
});

test('ID with letters rejected', () => {
    const r = InputValidator.validateDiscordId('1234567890123456a');
    assert.strictEqual(r.valid, false);
});

test('empty input rejected', () => {
    const r = InputValidator.validateDiscordId('');
    assert.strictEqual(r.valid, false);
});

// ── validateDuration ───────────────────────────────────────────────────────────
console.log('\nvalidateDuration');

test('seconds: "30s" → 30000 ms', () => {
    const r = InputValidator.validateDuration('30s');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.value, 30000);
});

test('minutes: "5m" → 300000 ms', () => {
    const r = InputValidator.validateDuration('5m');
    assert.strictEqual(r.value, 5 * 60 * 1000);
});

test('hours: "2h" → 7200000 ms', () => {
    const r = InputValidator.validateDuration('2h');
    assert.strictEqual(r.value, 2 * 60 * 60 * 1000);
});

test('days: "1d" → 86400000 ms', () => {
    const r = InputValidator.validateDuration('1d');
    assert.strictEqual(r.value, 24 * 60 * 60 * 1000);
});

test('weeks: "1w" → 604800000 ms', () => {
    const r = InputValidator.validateDuration('1w');
    assert.strictEqual(r.value, 7 * 24 * 60 * 60 * 1000);
});

test('invalid format rejected', () => {
    const r = InputValidator.validateDuration('10x');
    assert.strictEqual(r.valid, false);
});

test('plain number rejected', () => {
    const r = InputValidator.validateDuration('100');
    assert.strictEqual(r.valid, false);
});

test('empty string rejected', () => {
    const r = InputValidator.validateDuration('');
    assert.strictEqual(r.valid, false);
});

// ── sanitizeText ───────────────────────────────────────────────────────────────
console.log('\nsanitizeText');

test('removes angle brackets', () => {
    assert.strictEqual(InputValidator.sanitizeText('<script>'), 'script');
});

test('removes code block markers', () => {
    assert.strictEqual(InputValidator.sanitizeText('```code```'), 'code');
});

test('trims whitespace', () => {
    assert.strictEqual(InputValidator.sanitizeText('  hello  '), 'hello');
});

test('returns empty string for falsy input', () => {
    assert.strictEqual(InputValidator.sanitizeText(''), '');
    assert.strictEqual(InputValidator.sanitizeText(null), '');
});

test('leaves safe text unchanged', () => {
    assert.strictEqual(InputValidator.sanitizeText('Hello World!'), 'Hello World!');
});

// ── validateObject ─────────────────────────────────────────────────────────────
console.log('\nvalidateObject');

test('validates object against schema successfully', () => {
    const schema = {
        name: (v) => InputValidator.validateString(v, { maxLength: 20 }),
        age:  (v) => InputValidator.validateNumber(v, { min: 0, max: 150 })
    };
    const r = InputValidator.validateObject({ name: 'Alice', age: 30 }, schema);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.data.name, 'Alice');
    assert.strictEqual(r.data.age, 30);
});

test('collects errors from failing fields', () => {
    const schema = {
        name: (v) => InputValidator.validateString(v, { maxLength: 3 }),
        age:  (v) => InputValidator.validateNumber(v, { min: 18 })
    };
    const r = InputValidator.validateObject({ name: 'Alice', age: 5 }, schema);
    assert.strictEqual(r.valid, false);
    assert(r.errors.some(e => e.includes('name')));
    assert(r.errors.some(e => e.includes('age')));
});

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
