/**
 * A yt-dlp exit with `code === null` means "killed by signal", not "failed".
 * Skip/stop/new-track/shutdown kills must stay silent — that was the
 * "❌ yt-dlp stream failed: yt-dlp exited with code null" spam.
 */
'use strict';

const assert = require('assert');

const MusicQueue = require('../utils/music/MusicQueue');

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

const decide = MusicQueue.shouldReportYtDlpFailure;

console.log('\nshouldReportYtDlpFailure');

test('is exported for reuse', () => {
  assert.strictEqual(typeof decide, 'function');
});

test('clean exit (code 0) is not a failure', () => {
  assert.strictEqual(decide({ code: 0, killed: false, stale: false, playerIdle: false }), false);
});

test('our own SIGKILL on skip/stop is not a failure', () => {
  assert.strictEqual(decide({ code: null, killed: true, stale: false, playerIdle: false }), false);
});

test('a superseded process from the previous track is not a failure', () => {
  assert.strictEqual(decide({ code: null, killed: false, stale: true, playerIdle: false }), false);
});

test('exit after the player went idle is not a failure', () => {
  assert.strictEqual(decide({ code: null, killed: false, stale: false, playerIdle: true }), false);
});

test('shutdown never reports failures', () => {
  assert.strictEqual(
    decide({ code: 1, killed: false, stale: false, playerIdle: false, shuttingDown: true }),
    false
  );
});

test('real yt-dlp error (code 1) is reported', () => {
  assert.strictEqual(decide({ code: 1, killed: false, stale: false, playerIdle: false }), true);
});

test('external kill while playing (e.g. OOM) is reported', () => {
  assert.strictEqual(
    decide({ code: null, killed: false, stale: false, playerIdle: false, shuttingDown: false }),
    true
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
