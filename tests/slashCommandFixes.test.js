/**
 * Regression tests for the slash-command bugs reported by /testcommands.
 * Covers: permissions.isDJ export, /shop select-menu cap, /customcmd list
 * formatting, and the optional MongoDB driver guard.
 */
'use strict';

const assert = require('assert');
const path = require('path');

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

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function injectStub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function buildMockInteraction(overrides = {}) {
  const replies = [];
  return {
    id: '1',
    guildId: '999',
    guild: { id: '999', name: 'Guild', members: { me: { voice: { channel: null } } } },
    channel: { id: '777', send: async () => ({}) },
    user: { id: '42', tag: 'user#0001', username: 'user' },
    member: { id: '42', permissions: { has: () => true } },
    client: { queues: new Map() },
    options: {
      getSubcommand: () => 'list',
      getString: () => 'test',
      getInteger: () => 50,
    },
    async reply(payload) {
      replies.push(payload);
      this.replied = true;
      return {
        createMessageComponentCollector: () => ({ on: () => {}, stop: () => {} }),
      };
    },
    async editReply(payload) {
      replies.push(payload);
      return {};
    },
    async fetchReply() {
      return { createMessageComponentCollector: () => ({ on: () => {}, stop: () => {} }) };
    },
    replies,
    ...overrides,
  };
}

// ── permissions ──────────────────────────────────────────────────────────────
console.log('\nutils/permissions');

const permissions = require('../utils/core/permissions');

test('exports isDJ used by the music commands', () => {
  assert.strictEqual(typeof permissions.isDJ, 'function');
});

test('isDJ returns false for incomplete members instead of throwing', () => {
  assert.strictEqual(permissions.isDJ(null), false);
  assert.strictEqual(permissions.isDJ({}), false);
});

test('isDJ is true for the guild owner', () => {
  const member = {
    id: '1',
    guild: { id: '9', ownerId: '1' },
    permissions: { has: () => false },
    roles: { cache: { some: () => false } },
  };
  assert.strictEqual(permissions.isDJ(member), true);
});

// ── /shop select menu ────────────────────────────────────────────────────────
console.log('\n/shop');

injectStub(path.join(__dirname, '..', 'utils', 'economy', 'economyManager.js'), {
  getShopItems: () =>
    Array.from({ length: 30 }, (_, i) => ({
      id: `item_${i}`,
      name: `Item ${i}`,
      price: 10 + i,
      type: i % 2 === 0 ? 'role' : 'badge',
    })),
  getUserData: () => ({ balance: 100 }),
  addItem: async () => true,
  removeMoney: async () => true,
});

(async () => {
  const shop = require('../slashCommands/economy/shop');

  await testAsync('builds a select menu with more than 25 shop items', async () => {
    const interaction = buildMockInteraction();
    await shop.execute(interaction);

    const payload = interaction.replies[0];
    assert.ok(payload && payload.embeds, 'shop replied with an embed');

    const row = payload.components?.[0];
    const menu = row?.components?.[0]?.toJSON
      ? row.components[0].toJSON()
      : (row?.components?.[0] ?? row?.[0]);
    const options = menu?.options || menu?.components?.[0]?.options;
    if (Array.isArray(options)) {
      assert.ok(options.length <= 25, `select menu capped at 25 (got ${options.length})`);
    }
  });

  // ── /customcmd list ────────────────────────────────────────────────────────
  console.log('\n/customcmd');

  injectStub(path.join(__dirname, '..', 'utils', 'roles', 'customCommandManager.js'), {
    getCommands: () => ({
      welcome: { response: 'Welcome to the server!', cooldown: 5 },
      verylong: { response: 'x'.repeat(120), cooldown: 0 },
    }),
    getCommand: () => null,
    addCommand: async () => true,
    removeCommand: async () => true,
  });

  const customcmd = require('../slashCommands/moderation/customcmd');

  await testAsync('lists object-shaped custom commands without throwing', async () => {
    const interaction = buildMockInteraction({
      options: { getSubcommand: () => 'list', getString: () => 'test' },
    });

    await customcmd.execute(interaction);

    const payload = interaction.replies[0];
    assert.ok(payload?.embeds, 'replied with an embed');
    const description = payload.embeds[0].toJSON().description;
    assert.ok(description.includes('!welcome'), 'welcome command listed');
    assert.ok(description.includes('Welcome to the server!'), 'response text shown');
    assert.ok(description.includes('...'), 'long response truncated');
  });

  // ── MongoDB optional driver ────────────────────────────────────────────────
  console.log('\ncheck-mongodb-space');

  const mongo = require('../check-mongodb-space');

  test('exposes a driver availability check', () => {
    assert.strictEqual(typeof mongo.isMongoDriverAvailable(), 'boolean');
  });

  await testAsync('reports a clear error when the driver is missing', async () => {
    if (mongo.isMongoDriverAvailable()) {
      console.log('     (mongodb installed — skipping missing-driver assertion)');
      return;
    }

    await assert.rejects(
      () => mongo.connectMongoWithRetry('mongodb://127.0.0.1:1/nope', 1, 1),
      (error) => error.code === 'MONGO_DRIVER_MISSING'
    );
  });

  test('still validates the URI format', () => {
    assert.ok(mongo.validateMongoUri(null));
    assert.ok(mongo.validateMongoUri('http://example.com'));
    assert.strictEqual(mongo.validateMongoUri('mongodb://localhost:27017/db'), null);
  });

  // ── /testcommands ──────────────────────────────────────────────────────────
  console.log('\n/testcommands');

  const testcommands = require('../slashCommands/admin/testcommands');

  test('collects slash commands and flags intentionally-failing ones', () => {
    const commands = testcommands.collectCommands();
    assert.ok(Array.isArray(commands) && commands.length > 50, 'found slash commands');

    const testerror = commands.find((cmd) => cmd.name === 'testerror');
    assert.ok(testerror, 'testerror discovered');
    assert.strictEqual(testerror.skipInSimulation, true, 'testerror is skipped in simulation');
  });

  test('builds a report with failures, stacks, skips and passes', () => {
    const report = testcommands.buildReport({
      interaction: { user: { tag: 'owner#0001', id: '1' }, guild: { name: 'Guild' }, guildId: '9' },
      total: 4,
      passed: [{ name: 'ping', file: 'utility/ping.js' }],
      failed: [
        {
          name: 'boom',
          file: 'utility/boom.js',
          reason: 'kaboom',
          stack: 'Error: kaboom\n    at Object.execute (boom.js:1:1)',
        },
      ],
      skipped: [{ name: 'testerror', file: 'admin/testerror.js', reason: 'intentional' }],
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T00:00:10Z'),
      dataGuard: { blocked: ['economy.json'], restored: ['moderation.json'] },
    });

    assert.ok(report.includes('Total: 4  |  Passed: 1  |  Failed: 1  |  Skipped: 1'));
    assert.ok(report.includes('FAILED (1)'));
    assert.ok(report.includes('utility/boom.js'));
    assert.ok(report.includes('Stack:'));
    assert.ok(report.includes('SKIPPED (1)'));
    assert.ok(report.includes('PASSED (1)'));
    assert.ok(report.includes('Duration:   10.0s'));
    assert.ok(report.includes('Data guard: blocked 1 write(s)'));
  });

  // ── Data guard ─────────────────────────────────────────────────────────────
  console.log('\ndata guard');

  const fsSync = require('fs');
  const dataDir = path.join(__dirname, '..', 'data');

  test('blocks writes into data/ while the simulation runs', () => {
    const target = path.join(dataDir, '__guard_probe__.json');
    const guard = testcommands.installDataWriteGuard();

    try {
      fsSync.writeFileSync(target, '{"probe":true}');
      assert.strictEqual(fsSync.existsSync(target), false, 'write must be blocked');
      assert.ok(guard.blockedFiles.includes('__guard_probe__.json'));
    } finally {
      guard.restore();
    }
  });

  test('restores data files that were modified during the run', () => {
    const target = path.join(dataDir, '__restore_probe__.json');
    fsSync.writeFileSync(target, '{"original":true}');

    const snapshot = testcommands.snapshotDataDirectory();
    fsSync.writeFileSync(target, '{"original":false}');
    const restored = testcommands.restoreDataDirectory(snapshot);

    const content = fsSync.readFileSync(target, 'utf8');
    fsSync.rmSync(target, { force: true });

    assert.ok(restored.includes('__restore_probe__.json'));
    assert.ok(content.includes('"original":true'));
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
