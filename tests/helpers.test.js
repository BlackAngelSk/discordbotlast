/**
 * Jest tests for utils/helpers.js
 */
'use strict';

const {
  parseDuration,
  formatDuration,
  formatNumber,
  parseFlexibleDate,
  toDateObject,
  formatDateLabel,
} = require('../utils/helpers');

describe('parseDuration', () => {
  test('parses MM:SS format', () => {
    expect(parseDuration('3:45')).toBe(225);
  });

  test('parses HH:MM:SS format', () => {
    expect(parseDuration('1:30:00')).toBe(5400);
  });

  test('returns 0 for invalid format', () => {
    expect(parseDuration('invalid')).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(parseDuration('')).toBe(0);
  });
});

describe('formatDuration', () => {
  test('formats seconds to MM:SS', () => {
    expect(formatDuration(225)).toBe('3:45');
  });

  test('formats seconds to HH:MM:SS', () => {
    expect(formatDuration(5400)).toBe('1:30:00');
  });

  test('formats 0 seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('formatNumber', () => {
  test('formats thousands', () => {
    expect(formatNumber(1500)).toBe('1.5K');
  });

  test('formats millions', () => {
    expect(formatNumber(2500000)).toBe('2.5M');
  });

  test('formats billions', () => {
    expect(formatNumber(1000000000)).toBe('1B');
  });

  test('formats small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });

  test('handles negative numbers', () => {
    expect(formatNumber(-100)).toBe('0');
  });

  test('handles non-number input', () => {
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('parseFlexibleDate', () => {
  test('parses Date object', () => {
    const date = new Date('2024-01-01');
    expect(parseFlexibleDate(date)).toEqual(date);
  });

  test('parses timestamp number', () => {
    const timestamp = 1704067200000;
    expect(parseFlexibleDate(timestamp)).toEqual(new Date(timestamp));
  });

  test('parses string date', () => {
    const result = parseFlexibleDate('2024-01-01');
    expect(result).toBeInstanceOf(Date);
  });

  test('returns null for invalid input', () => {
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate(undefined)).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });
});

describe('toDateObject', () => {
  test('returns Date object for valid input', () => {
    const result = toDateObject('2024-01-01');
    expect(result).toBeInstanceOf(Date);
  });

  test('returns fallback for invalid input', () => {
    const result = toDateObject(null, '2024-01-01');
    expect(result).toBeInstanceOf(Date);
  });
});
