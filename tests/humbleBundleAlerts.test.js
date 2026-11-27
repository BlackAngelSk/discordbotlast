/**
 * Humble Bundle alerts: diffing new/ended bundles, seeding on setup and the
 * poll loop that posts to a channel. Network and Discord are stubbed.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const alertsModule = require('../utils/bundles/humbleBundleAlerts');

const { HumbleBundleAlertsManager, sanitizeTypes, POLL_INTERVAL } = alertsModule;

let passed = 0;
let failed = 0;
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeBundle(slug, { hours = 72, title = `Bundle ${slug}`, type = 'games' } = {}) {
  return {
    slug,
    type,
    title,
    url: `https://www.humblebundle.com/${type}/${slug}`,
    headline: 'Test headline',
    endDate: new Date(Date.now() + hours * HOUR),
    startDate: new Date(Date.now() - 5 * DAY),
    remainingMs: hours * HOUR,
    ended: hours <= 0,
    value: { amount: 100, currency: 'USD' },
    image: null,
  };
}

function makeManager() {
  const manager = new HumbleBundleAlertsManager();
  manager.dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hb-alerts-')), 'alerts.json');
  manager.data = { guilds: {} };
  return manager;
}

/** Fake Discord client with one text channel that records sends and deletions. */
function makeClient(channelId = 'chan-1') {
  const sent = [];
  const deleted = [];
  let nextId = 1000;

  const channel = {
    id: channelId,
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      return { id: `msg-${(nextId += 1)}` };
    },
    messages: {
      fetch: async (id) => ({
        id,
        delete: async () => {
          deleted.push(id);
        },
      }),
    },
  };

  return {
    sent,
    deleted,
    client: { channels: { cache: new Map([[channelId, channel]]) } },
  };
}

// ============================================================
console.log('\n=== Config helpers ===');
// ============================================================

test('sanitizeTypes normalises input', () => {
  assert.deepStrictEqual(sanitizeTypes('all'), ['games', 'books', 'software']);
  assert.deepStrictEqual(sanitizeTypes('books'), ['books']);
  assert.deepStrictEqual(sanitizeTypes(['books', 'books', 'software']), ['books', 'software']);
  assert.deepStrictEqual(sanitizeTypes('nonsense'), ['games']);
  assert.deepStrictEqual(sanitizeTypes(undefined), ['games']);
});

test('polling runs every 30 minutes', () => {
  assert.strictEqual(POLL_INTERVAL, 30 * 60 * 1000);
});

// ============================================================
console.log('\n=== diff ===');
// ============================================================

test('diff reports new bundles and records them', () => {
  const manager = makeManager();
  const config = { seen: {} };

  const { fresh, ended } = manager.diff(config, [makeBundle('alpha'), makeBundle('beta')]);

  assert.deepStrictEqual(
    fresh.map((bundle) => bundle.slug),
    ['alpha', 'beta']
  );
  assert.deepStrictEqual(ended, []);
  assert.deepStrictEqual(Object.keys(config.seen).sort(), ['alpha', 'beta']);
  assert.ok(config.seen.alpha.endDate, 'end date stored');
});

test('diff does not re-announce a bundle that is already known', () => {
  const manager = makeManager();
  const config = { seen: {} };
  manager.diff(config, [makeBundle('alpha')]);

  const { fresh } = manager.diff(config, [makeBundle('alpha')]);
  assert.deepStrictEqual(fresh, []);
});

test('diff reports ended bundles and drops them from the seen list', () => {
  const manager = makeManager();
  const config = {
    seen: {
      gone: {
        title: 'Gone Bundle',
        url: 'https://www.humblebundle.com/games/gone',
        endDate: new Date(Date.now() - HOUR).toISOString(),
      },
      live: {
        title: 'Live Bundle',
        url: 'https://www.humblebundle.com/games/live',
        endDate: new Date(Date.now() + DAY).toISOString(),
      },
    },
  };

  const { fresh, ended } = manager.diff(config, []);

  assert.deepStrictEqual(fresh, []);
  assert.deepStrictEqual(
    ended.map((entry) => entry.slug),
    ['gone']
  );
  assert.deepStrictEqual(Object.keys(config.seen), ['live']);
});

test('diff follows an extended end date instead of re-announcing', () => {
  const manager = makeManager();
  const config = { seen: {} };
  manager.diff(config, [makeBundle('alpha', { hours: 24 })]);

  const extended = makeBundle('alpha', { hours: 240 });
  const { fresh } = manager.diff(config, [extended]);

  assert.deepStrictEqual(fresh, [], 'not treated as new');
  assert.strictEqual(config.seen.alpha.endDate, extended.endDate.toISOString());
});

test('diff ignores bundles that already ended in the current fetch', () => {
  const manager = makeManager();
  const config = { seen: {} };

  const { fresh } = manager.diff(config, [makeBundle('expired', { hours: -2 })]);

  assert.deepStrictEqual(fresh, []);
  assert.deepStrictEqual(Object.keys(config.seen), []);
});

// ============================================================
console.log('\n=== enable ===');
// ============================================================

test('enable seeds live bundles so setup does not spam the channel', async () => {
  const manager = makeManager();
  manager.fetcher = async () => ({
    bundles: [makeBundle('alpha'), makeBundle('beta')],
    fetchedAt: new Date().toISOString(),
  });

  const result = await manager.enable('guild-1', 'chan-1', { types: 'all' });

  assert.strictEqual(result.seeded, 2);
  assert.strictEqual(manager.getGuildConfig('guild-1').channelId, 'chan-1');
  assert.deepStrictEqual(manager.getGuildConfig('guild-1').types, ['games', 'books', 'software']);
  assert.deepStrictEqual(Object.keys(manager.getGuildConfig('guild-1').seen).sort(), [
    'alpha',
    'beta',
  ]);
  assert.ok(fs.existsSync(manager.dataFile), 'config persisted');
});

test('enable survives a fetch failure and still stores the channel', async () => {
  const manager = makeManager();
  manager.fetcher = async () => {
    throw new Error('HTTP 503');
  };

  const result = await manager.enable('guild-1', 'chan-1', { types: ['games'] });

  assert.strictEqual(result.seeded, 0);
  assert.strictEqual(manager.getGuildConfig('guild-1').channelId, 'chan-1');
});

// ============================================================
console.log('\n=== poll ===');
// ============================================================

test('poll posts one message per new bundle and remembers its id', async () => {
  const manager = makeManager();
  const { client, sent } = makeClient();
  manager.client = client;
  manager.fetcher = async () => ({
    bundles: [makeBundle('alpha'), makeBundle('beta')],
    fetchedAt: new Date().toISOString(),
  });

  manager.data.guilds['guild-1'] = {
    channelId: 'chan-1',
    types: ['games'],
    enabled: true,
    seen: {},
  };

  await manager.poll();

  assert.strictEqual(sent.length, 2, 'one message per bundle');
  assert.ok(sent[0].embeds[0].data.title.includes('New games bundle: Bundle alpha'));

  const seen = manager.getGuildConfig('guild-1').seen;
  assert.ok(seen.alpha.messageId, 'announcement id stored');
  assert.ok(seen.beta.messageId);

  await manager.poll();
  assert.strictEqual(sent.length, 2, 'no repeat announcement');
});

test('poll deletes the announcement message when a bundle ends', async () => {
  const manager = makeManager();
  const { client, sent, deleted } = makeClient();
  manager.client = client;
  manager.fetcher = async () => ({ bundles: [], fetchedAt: new Date().toISOString() });

  manager.data.guilds['guild-1'] = {
    channelId: 'chan-1',
    types: ['games'],
    enabled: true,
    seen: {
      gone: {
        title: 'Gone Bundle',
        url: 'https://www.humblebundle.com/games/gone',
        endDate: new Date(Date.now() - HOUR).toISOString(),
        messageId: 'msg-999',
      },
    },
  };

  await manager.poll();

  assert.deepStrictEqual(deleted, ['msg-999'], 'announcement removed');
  assert.strictEqual(sent.length, 0, 'no extra notice needed');
  assert.deepStrictEqual(Object.keys(manager.getGuildConfig('guild-1').seen), []);
});

test('poll posts an ended notice when the message cannot be deleted', async () => {
  const manager = makeManager();
  const { client, sent } = makeClient();
  manager.client = client;
  manager.fetcher = async () => ({ bundles: [], fetchedAt: new Date().toISOString() });

  manager.data.guilds['guild-1'] = {
    channelId: 'chan-1',
    types: ['games'],
    enabled: true,
    seen: {
      gone: {
        title: 'Gone Bundle',
        url: 'https://www.humblebundle.com/games/gone',
        endDate: new Date(Date.now() - HOUR).toISOString(),
      },
    },
  };

  await manager.poll();

  assert.strictEqual(sent.length, 1);
  const embed = sent[0].embeds[0].data;
  assert.ok(embed.title.includes('Bundle ended'), embed.title);
  assert.ok(embed.description.includes('Gone Bundle'));
});

test('poll skips guilds without a channel or when disabled', async () => {
  const manager = makeManager();
  const { client, sent } = makeClient();
  manager.client = client;
  let calls = 0;
  manager.fetcher = async () => {
    calls++;
    return { bundles: [makeBundle('alpha')], fetchedAt: new Date().toISOString() };
  };

  manager.data.guilds['no-channel'] = { types: ['games'], enabled: true, seen: {} };
  manager.data.guilds['paused'] = {
    channelId: 'chan-1',
    types: ['games'],
    enabled: false,
    seen: {},
  };

  await manager.poll();

  assert.strictEqual(calls, 0, 'nothing fetched');
  assert.strictEqual(sent.length, 0);
});

// ============================================================
console.log('\n=== message building ===');
// ============================================================

test('new-bundle embed carries the card and links to the bundle', () => {
  const manager = makeManager();
  const embed = manager.buildBundleEmbed(makeBundle('alpha')).embeds[0].data;

  assert.ok(embed.title.includes('New games bundle: Bundle alpha'), embed.title);
  assert.strictEqual(embed.url, 'https://www.humblebundle.com/games/alpha');
  assert.ok(embed.description.includes('left'));
  assert.ok(embed.description.includes('[Open bundle]'));
});

test('ended embed links each bundle', () => {
  const manager = makeManager();
  const payload = manager.buildEndedPayload([
    { slug: 'gone', title: 'Gone Bundle', url: 'https://www.humblebundle.com/games/gone' },
  ]);

  const embed = payload.embeds[0].data;
  assert.ok(embed.title.includes('Bundle ended'));
  assert.ok(embed.description.includes('[Gone Bundle](https://www.humblebundle.com/games/gone)'));
});

// ============================================================
console.log('\n=== status ===');
// ============================================================

test('getStatus summarises tracking state', () => {
  const manager = makeManager();
  const soon = new Date(Date.now() + 5 * HOUR).toISOString();
  manager.data.guilds['guild-1'] = {
    channelId: 'chan-1',
    types: ['games'],
    enabled: true,
    lastCheckedAt: new Date().toISOString(),
    seen: {
      alpha: { title: 'Alpha', endDate: soon },
      beta: { title: 'Beta', endDate: new Date(Date.now() + 5 * DAY).toISOString() },
    },
  };

  const status = manager.getStatus('guild-1');

  assert.strictEqual(status.channelId, 'chan-1');
  assert.strictEqual(status.tracked, 2);
  assert.strictEqual(status.nextEndAt, soon);
  assert.strictEqual(manager.getStatus('unknown'), null);
});

queue.then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);
  if (failed > 0) process.exit(1);
});
