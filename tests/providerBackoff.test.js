/**
 * A dead provider (e.g. NVIDIA returning HTTP 503) must not be retried — or
 * logged — on every 15-minute poll. These tests pin the backoff, the log
 * throttling and the poll summary throttle.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const manager = require('../utils/steamGameUpdatesManager');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

let passed = 0;
let failed = 0;

// Tests run strictly one at a time: they share the module-level health map and
// temporarily replace console, so concurrency would corrupt both.
let queue = Promise.resolve();

function test(name, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (error) {
      failed++;
      console.log(`  ❌ ${name}`);
      console.log(`     ${error.message}`);
    }
  });
  return queue;
}

/** Capture console output while running fn. */
function capture(fn) {
  const lines = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => lines.push(args.join(' '));
  console.log = (...args) => lines.push(args.join(' '));
  const restore = () => {
    console.error = originalError;
    console.log = originalLog;
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          restore();
          return { value, lines };
        },
        (error) => {
          restore();
          throw error;
        }
      );
    }
    restore();
    return { value: result, lines };
  } catch (error) {
    restore();
    throw error;
  }
}

function reset() {
  manager.resetProviderHealth();
  manager.lastPollSummaryAt = 0;
}

// ============================================================
console.log('\n=== Backoff curve ===');
// ============================================================

test('backoff doubles from 15m and caps at 12h', () => {
  const expected = [15, 30, 60, 120, 240, 480, 720, 720, 720];
  const actual = expected.map((_, index) => manager.computeProviderBackoffMs(index + 1) / MINUTE);
  assert.deepStrictEqual(actual, expected);
});

test('backoff treats missing/zero attempt counts as the first failure', () => {
  assert.strictEqual(manager.computeProviderBackoffMs(0), 15 * MINUTE);
  assert.strictEqual(manager.computeProviderBackoffMs(undefined), 15 * MINUTE);
});

// ============================================================
console.log('\n=== Failure logging ===');
// ============================================================

test('first failure logs once and records a retry time', async () => {
  reset();
  const { lines } = await capture(() =>
    manager.markProviderFailure('nvidia', new Error('HTTP 503'))
  );

  assert.strictEqual(lines.length, 1, 'exactly one log line');
  assert.ok(lines[0].includes('[nvidia]'), 'line names the source');
  assert.ok(lines[0].includes('HTTP 503'), 'line carries the real error');
  assert.ok(lines[0].includes('retrying in 15m'), 'line states the retry delay');

  const health = manager.getProviderHealth();
  assert.strictEqual(health.length, 1);
  assert.strictEqual(health[0].sourceKey, 'nvidia');
  assert.strictEqual(health[0].fails, 1);
  assert.ok(health[0].retryInMs > 14 * MINUTE, 'retry is scheduled in the future');
});

test('repeat failures stay silent for 6h and keep backing off', async () => {
  reset();
  await capture(() => manager.markProviderFailure('nvidia', new Error('HTTP 503')));

  const { lines } = await capture(() => {
    manager.markProviderFailure('nvidia', new Error('HTTP 503'));
    manager.markProviderFailure('nvidia', new Error('HTTP 503'));
  });

  assert.deepStrictEqual(lines, [], 'no repeated log lines');
  const health = manager.getProviderHealth()[0];
  assert.strictEqual(health.fails, 3);
  assert.ok(health.retryInMs > 59 * MINUTE, 'third failure waits ~1h');
});

test('a failure is re-logged after the 6h log interval', async () => {
  reset();
  await capture(() => manager.markProviderFailure('nvidia', new Error('HTTP 503')));

  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const { lines } = await capture(() => {
      offset = 7 * HOUR;
      manager.markProviderFailure('nvidia', new Error('HTTP 503'));
    });

    assert.strictEqual(lines.length, 1, 'reminder logged after the 6h window');
    assert.ok(lines[0].includes('still failing (2 attempts)'), lines[0]);
    assert.strictEqual(manager.getProviderHealth()[0].fails, 2);
  } finally {
    Date.now = realNow;
  }
});

test('successful recovery clears the backoff and logs once', async () => {
  reset();
  await capture(() => manager.markProviderFailure('nvidia', new Error('HTTP 503')));

  const { lines } = await capture(() => manager.markProviderSuccess('nvidia'));
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes('recovered after 1 failed attempt'));
  assert.deepStrictEqual(manager.getProviderHealth(), []);

  const quiet = await capture(() => manager.markProviderSuccess('nvidia'));
  assert.deepStrictEqual(quiet.lines, [], 'no log when there was nothing to recover');
});

// ============================================================
console.log('\n=== Cooldown skipping ===');
// ============================================================

test('a cooling-down source is skipped without calling the fetcher', async () => {
  reset();
  await capture(() => manager.markProviderFailure('nvidia', new Error('HTTP 503')));

  assert.strictEqual(manager.isProviderCoolingDown('nvidia'), true);
  assert.strictEqual(manager.isProviderCoolingDown('amd'), false);

  let calls = 0;
  const articles = await manager.runTrackedFetch('nvidia', async () => {
    calls++;
    return [{ key: 'x' }];
  });

  assert.deepStrictEqual(articles, []);
  assert.strictEqual(calls, 0, 'fetcher never ran during cooldown');
});

test('a failing fetch throws, records health and is not retried next poll', async () => {
  reset();
  const { lines } = await capture(async () => {
    await assert.rejects(
      () => manager.runTrackedFetch('nvidia', async () => Promise.reject(new Error('HTTP 503'))),
      /HTTP 503/
    );
  });

  assert.strictEqual(lines.length, 1, 'one log line for the failed fetch');
  assert.strictEqual(manager.getProviderHealth()[0].fails, 1);
  assert.strictEqual(manager.isProviderCoolingDown('nvidia'), true);
});

test('concurrent fetches for one source are deduplicated', async () => {
  reset();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [{ key: 'a' }];
  };

  const [first, second] = await Promise.all([
    manager.runTrackedFetch('nvidia', fetcher),
    manager.runTrackedFetch('nvidia', fetcher),
  ]);

  assert.strictEqual(calls, 1, 'only one upstream request');
  assert.deepStrictEqual(first, second);
});

// ============================================================
console.log('\n=== Poll summary throttle ===');
// ============================================================

test('poll summary logs at most once per 6h', async () => {
  reset();
  const { lines } = await capture(() => {
    manager.logPollSummary(3, new Set());
    manager.logPollSummary(3, new Set());
    manager.logPollSummary(3, new Set());
  });

  assert.strictEqual(lines.length, 1, 'three polls, one summary line');
  assert.ok(lines[0].includes('all OK'));

  const second = await capture(() => manager.logPollSummary(3, new Set()));
  assert.deepStrictEqual(second.lines, [], 'still throttled 15 minutes later');
});

test('poll summary names failing sources instead of claiming all OK', async () => {
  reset();
  await capture(() => manager.markProviderFailure('nvidia', new Error('HTTP 503')));

  const { lines } = await capture(() => manager.logPollSummary(3, new Set()));
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes('1 failing (nvidia)'), lines[0]);
});

// ============================================================
console.log('\n=== Source wiring ===');
// ============================================================

const source = fs.readFileSync(
  path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
  'utf8'
);

test('nvidia fetches use the browser UA that Akamai does not block', () => {
  const start = source.indexOf('async function fetchNvidiaUpdates');
  const end = source.indexOf('async function fetchAmdUpdates');
  assert.ok(start > 0 && end > start, 'nvidia fetcher located');
  const block = source.slice(start, end);
  const headerUses = block.match(/headers: BROWSER_REQUEST_HEADERS/g) || [];
  assert.ok(
    headerUses.length >= 2,
    `both nvidia URLs need the browser UA (found ${headerUses.length})`
  );
});

test('provider fetchers no longer log their own errors', () => {
  for (const label of ['PoE', 'Fortnite', 'NVIDIA driver', 'AMD driver', 'Intel driver']) {
    assert.ok(
      !source.includes(`Error fetching ${label} updates`),
      `${label} should not double-log the failure`
    );
  }
});

test('poll loop does not log each failed source', () => {
  assert.ok(
    !source.includes('Game update fetch failed for'),
    'per-source error line removed from the poll loop'
  );
});

test('health state is exposed for status output', () => {
  assert.strictEqual(typeof manager.getProviderHealth, 'function');
  assert.strictEqual(typeof manager.resetProviderHealth, 'function');
});

// ============================================================
queue.then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);
  if (failed > 0) process.exit(1);
});
