/**
 * yt-dlp self-update: output classification, version parsing, scheduler config.
 * Nothing here spawns `yt-dlp -U`.
 */
'use strict';

const assert = require('assert');

const updater = require('../utils/music/ytdlpUpdater');

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

const classify = updater.classifyYtDlpUpdate;

console.log('\nclassifyYtDlpUpdate');

test('already up to date', () => {
  const result = classify({
    exitCode: 0,
    stdout: 'yt-dlp is up to date (2026.10.26)',
    stderr: '',
  });

  assert.strictEqual(result.status, 'up-to-date');
  assert.strictEqual(result.version, '2026.10.26');
});

test('reports an update', () => {
  const result = classify({
    exitCode: 0,
    stdout: 'Downloading yt-dlp ...\nUpdated yt-dlp to 2026.11.05',
    stderr: '',
  });

  assert.strictEqual(result.status, 'updated');
  assert.strictEqual(result.version, '2026.11.05');
});

test('detects package-manager installs', () => {
  const result = classify({
    exitCode: 1,
    stdout: '',
    stderr: 'ERROR: You installed yt-dlp via a package manager. It is not possible to update.',
  });

  assert.strictEqual(result.status, 'package-manager');
});

test('reports a real failure with the reason', () => {
  const result = classify({
    exitCode: 1,
    stdout: '',
    stderr: 'ERROR: [Errno 13] Permission denied: /usr/local/bin/yt-dlp',
  });

  assert.strictEqual(result.status, 'failed');
  assert.match(result.detail, /Permission denied/);
});

test('reports a killed update', () => {
  const result = classify({ exitCode: null, signal: 'SIGKILL', stdout: '', stderr: '' });

  assert.strictEqual(result.status, 'failed');
  assert.match(result.detail, /killed/i);
});

test('handles empty output gracefully', () => {
  const result = classify({ exitCode: 1, stdout: '', stderr: '' });

  assert.strictEqual(result.status, 'failed');
  assert.ok(result.detail.length > 0);
});

console.log('\nparseVersion / interval');

test('parses yt-dlp versions', () => {
  assert.strictEqual(updater.parseVersion('2026.10.26'), '2026.10.26');
  assert.strictEqual(updater.parseVersion('yt-dlp is up to date (2026.11.05)'), '2026.11.05');
  assert.strictEqual(updater.parseVersion('2026.10.26.123456'), '2026.10.26.123456');
  assert.strictEqual(updater.parseVersion('no version here'), null);
});

test('clamps the interval to 1–168 hours', () => {
  assert.strictEqual(updater.parseIntervalHours('12'), 12);
  assert.strictEqual(updater.parseIntervalHours('0'), 1);
  assert.strictEqual(updater.parseIntervalHours('9999'), 168);
  assert.strictEqual(updater.parseIntervalHours(undefined), 24);
  assert.strictEqual(updater.parseIntervalHours('abc'), 24);
});

console.log('\nscheduler');

test('start() is a no-op when disabled', () => {
  const previous = process.env.YTDLP_AUTO_UPDATE;
  process.env.YTDLP_AUTO_UPDATE = 'false';

  try {
    assert.strictEqual(updater.start(), false);
    assert.strictEqual(updater.isEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.YTDLP_AUTO_UPDATE;
    else process.env.YTDLP_AUTO_UPDATE = previous;
    updater.stop();
  }
});

test('status exposes binary, interval and last result', () => {
  const status = updater.getStatus();

  assert.strictEqual(typeof status.enabled, 'boolean');
  assert.strictEqual(typeof status.intervalHours, 'number');
  assert.ok('binary' in status);
  assert.ok('lastResult' in status);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
