/**
 * FFmpeg resolution must survive a missing optional `ffmpeg-static` package —
 * CI installs with a flaky binary download and npm then skips the dependency.
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

console.log('\nresolveFfmpegBinary');

test('is exported for reuse and testing', () => {
  assert.strictEqual(typeof MusicQueue.resolveFfmpegBinary, 'function');
});

test('resolves to a usable ffmpeg binary path', () => {
  const resolved = MusicQueue.resolveFfmpegBinary();

  assert.ok(typeof resolved === 'string' && resolved.length > 0, 'returns a path or "ffmpeg"');
});

test('falls back to system ffmpeg when ffmpeg-static is unavailable', () => {
  let staticInstalled = true;
  try {
    require.resolve('ffmpeg-static');
  } catch {
    staticInstalled = false;
  }

  if (staticInstalled) {
    console.log('     (ffmpeg-static installed — fallback path not exercised)');
    return;
  }

  assert.strictEqual(MusicQueue.resolveFfmpegBinary(), 'ffmpeg');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
