const assert = require('assert');
const { parseFlexibleDate, toDateObject, toEpochMs, formatDateLabel } = require('../utils/helpers');

function expectValidDate(value) {
    const parsed = parseFlexibleDate(value);
    assert(parsed instanceof Date, `Expected Date for value: ${value}`);
    assert(!Number.isNaN(parsed.getTime()), `Expected valid timestamp for value: ${value}`);
    return parsed;
}

function run() {
    const secondsNumber = 1714370400;
    const secondsString = '1714370400';
    const millisecondsNumber = 1714370400000;
    const isoString = '2026-04-29T10:00:00.000Z';

    const fromSecondsNumber = expectValidDate(secondsNumber);
    const fromSecondsString = expectValidDate(secondsString);
    const fromMilliseconds = expectValidDate(millisecondsNumber);
    const fromIso = expectValidDate(isoString);

    assert.strictEqual(fromSecondsNumber.getTime(), millisecondsNumber, 'Unix seconds number should normalize to milliseconds');
    assert.strictEqual(fromSecondsString.getTime(), millisecondsNumber, 'Unix seconds string should normalize to milliseconds');
    assert.strictEqual(fromMilliseconds.getTime(), millisecondsNumber, 'Unix milliseconds should remain unchanged');
    assert.strictEqual(fromIso.toISOString(), isoString, 'ISO string should preserve exact timestamp');

    const fallbackMs = 1714370400000;
    const fallbackDate = toDateObject('not-a-date', fallbackMs);
    assert.strictEqual(fallbackDate.getTime(), fallbackMs, 'Invalid date should use provided fallback timestamp');

    assert.strictEqual(toEpochMs(secondsNumber, 0), millisecondsNumber, 'toEpochMs should normalize seconds input');
    assert.strictEqual(toEpochMs('not-a-date', fallbackMs), fallbackMs, 'toEpochMs should use fallback on invalid input');

    assert.strictEqual(formatDateLabel('not-a-date', { fallbackLabel: 'N/A' }), 'N/A', 'Invalid date should render fallback label');

    console.log('Steam date normalization tests passed.');
}

run();
