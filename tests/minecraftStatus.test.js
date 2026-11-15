/**
 * Minecraft status lookups: fail fast, race the APIs, cache results.
 * Uses a stubbed `undici` module so no network is required.
 */
'use strict';

const assert = require('assert');
const path = require('path');

process.env.MINECRAFT_STATUS_TIMEOUT_MS = '300';
process.env.MINECRAFT_STATUS_ATTEMPTS = '1';
process.env.MINECRAFT_STATUS_CACHE_TTL_MS = '15000';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    failed++;
  }
}

function abortableDelay(ms, signal) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      error.code = 'ABORT_ERR';
      reject(error);
    }, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      error.code = 'ABORT_ERR';
      reject(error);
    });
  });
}

function onlinePayload(url) {
  if (url.includes('mcsrvstat.us')) {
    return {
      online: true,
      hostname: 'example.com',
      port: 25565,
      ip: '203.0.113.10',
      version: '1.21.4',
      players: { online: 5, max: 20, list: [{ name_clean: 'Steve' }] },
      motd: { clean: 'A test server' },
    };
  }

  return {
    online: true,
    host: 'example.com',
    port: 25565,
    ip_address: '203.0.113.10',
    version: { name_clean: '1.21.4' },
    players: { online: 5, max: 20, list: [{ name_clean: 'Steve' }] },
    motd: { clean: 'A test server' },
  };
}

function installFakeUndici(handler) {
  const undiciPath = require.resolve('undici');
  const calls = [];

  const fakeFetch = async (url, options = {}) => {
    calls.push(String(url));
    return handler(String(url), options, calls.length);
  };

  require.cache[undiciPath] = {
    id: undiciPath,
    filename: undiciPath,
    loaded: true,
    exports: { fetch: fakeFetch },
  };

  const modulePath = path.join(__dirname, '..', 'utils', 'status', 'minecraftStatus.js');
  delete require.cache[require.resolve(modulePath)];

  return { calls, module: require(modulePath) };
}

(async () => {
  console.log('\nreturns as soon as one API is online');

  await test('does not wait for the slow API to time out', async () => {
    const { module, calls } = installFakeUndici(async (url, options) => {
      if (url.includes('mcsrvstat.us')) {
        return abortableDelay(5000, options.signal); // hangs until aborted
      }

      return { ok: true, status: 200, json: async () => onlinePayload(url) };
    });

    const startedAt = Date.now();
    const status = await module.fetchMinecraftServerStatus('example.com', 25565);
    const elapsed = Date.now() - startedAt;

    assert.strictEqual(status.online, true);
    assert.strictEqual(status.version, '1.21.4');
    assert.ok(elapsed < 400, `expected a fast return, took ${elapsed}ms`);
    assert.strictEqual(calls.length, 2, 'both APIs were queried in parallel');
  });

  console.log('\ntimeout handling');

  await test('throws a concise timeout error when every source times out', async () => {
    const { module } = installFakeUndici(async (url, options) =>
      abortableDelay(5000, options.signal)
    );

    await assert.rejects(
      () => module.fetchMinecraftServerStatus('example.com', 25565),
      (error) => {
        assert.match(error.message, /timed out/i);
        assert.ok(error.message.length < 120, 'no giant error payload');
        return true;
      }
    );
  });

  console.log('\ncache');

  await test('serves repeat lookups from cache', async () => {
    const { module, calls } = installFakeUndici(async (url) => ({
      ok: true,
      status: 200,
      json: async () => onlinePayload(url),
    }));

    module.clearMinecraftStatusCache();

    await module.fetchMinecraftServerStatus('example.com', 25565);
    const afterFirst = calls.length;
    assert.ok(afterFirst >= 1);

    await module.fetchMinecraftServerStatus('example.com', 25565);
    assert.strictEqual(calls.length, afterFirst, 'second lookup must come from cache');
  });

  console.log('\ninput validation');

  await test('normalizes hosts, ports and pasted addresses', async () => {
    const { module } = installFakeUndici(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));

    assert.deepStrictEqual(module.normalizeMinecraftStatusInput('Example.COM:25565'), {
      host: 'example.com',
      port: 25565,
    });

    assert.strictEqual(
      module.normalizeMinecraftStatusInput('').error,
      'Minecraft server address is required.'
    );
    assert.ok(module.normalizeMinecraftStatusInput('bad host!').error);
    assert.ok(module.normalizeMinecraftStatusInput('example.com', 70000).error);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
