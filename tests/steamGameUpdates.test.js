/**
 * Tests for the refactored steamGameUpdatesManager.
 * Tests core utility functions, normalization, embed building, and provider lookup.
 */

const assert = require('assert');

// We need to test internal functions. We'll require the module source and
// extract what we need via a trick: the module exports a singleton instance,
// but we can test through the public API and also by examining known behaviors.

const manager = require('../utils/steamGameUpdatesManager');

let passed = 0;
let failed = 0;

// Async-aware harness: the previous version called `fn()` without awaiting, so
// every `async` test's assertions were deferred past the summary and failures
// surfaced only as an unhandled rejection after the process had printed "0 failed".
const pending = [];

function test(name, fn) {
  const run = Promise.resolve()
    .then(() => fn())
    .then(
      () => {
        passed++;
        console.log(`  ✅ ${name}`);
      },
      (error) => {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${error.message}`);
      }
    );

  pending.push(run);
  return run;
}

// ============================================================
console.log('\n=== Module Loading ===');
// ============================================================

test('Module exports an object', () => {
  assert.ok(manager && typeof manager === 'object');
});

test('Module has expected methods', () => {
  assert.strictEqual(typeof manager.getGuildConfig, 'function');
  assert.strictEqual(typeof manager.searchStoreGames, 'function');
  assert.strictEqual(typeof manager.fetchGameDetails, 'function');
  assert.strictEqual(typeof manager.buildTestAlerts, 'function');
  assert.strictEqual(typeof manager.updateGuildConfig, 'function');
  assert.strictEqual(typeof manager.disableAlerts, 'function');
  assert.strictEqual(typeof manager.getDashboardData, 'function');
  assert.strictEqual(typeof manager.isFeatureEnabled, 'function');
});

// ============================================================
console.log('\n=== Guild Config ===');
// ============================================================

test('getGuildConfig returns null for unknown guild', () => {
  const config = manager.getGuildConfig('nonexistent-guild-12345');
  assert.strictEqual(config, null);
});

// ============================================================
console.log('\n=== Test Alerts (no config) ===');
// ============================================================

test('buildTestAlerts returns sample alert when no games configured', async () => {
  // For a guild with no config, buildTestAlerts should return a sample embed
  const alerts = await manager.buildTestAlerts('test-guild-no-config');
  assert.ok(Array.isArray(alerts));
  assert.ok(alerts.length > 0, 'Should have at least one sample alert');
  assert.ok(alerts[0].embeds, 'Alert should have embeds property');
  assert.ok(Array.isArray(alerts[0].embeds));
  assert.ok(alerts[0].embeds.length > 0, 'Should have at least one embed');
});

test('Sample alert embed has correct structure', async () => {
  const alerts = await manager.buildTestAlerts('test-guild-no-config');
  const embed = alerts[0].embeds[0];

  // EmbedBuilder serializes to a plain object
  const data = embed.toJSON ? embed.toJSON() : embed;

  assert.ok(data.title, 'Embed should have a title');
  assert.ok(data.description, 'Embed should have a description');
  assert.ok(data.footer, 'Embed should have a footer');
  assert.ok(data.timestamp, 'Embed should have a timestamp');

  // Version field should be present in the sample
  const hasVersionField = data.fields && data.fields.some((f) => f.name === 'Version');
  assert.ok(hasVersionField, 'Sample embed should have a Version field');
});

test('Sample alert embed has section-based fields', async () => {
  const alerts = await manager.buildTestAlerts('test-guild-no-config');
  const embed = alerts[0].embeds[0];
  const data = embed.toJSON ? embed.toJSON() : embed;

  // The section markers live in embed fields (not the description), which is
  // what the embed builder is asserted to do further down this file.
  const fieldNames = (data.fields || []).map((f) => f.name.toUpperCase());
  assert.ok(fieldNames.includes('NEW FEATURES'), 'Embed should have a NEW FEATURES field');
  assert.ok(fieldNames.includes('BUG FIXES'), 'Embed should have a BUG FIXES field');
});

// ============================================================
console.log('\n=== Disable Alerts ===');
// ============================================================

test('disableAlerts does not throw for unknown guild', async () => {
  await assert.doesNotReject(() => manager.disableAlerts('unknown-guild-999'));
});

// ============================================================
console.log('\n=== getDashboardData ===');
// ============================================================

test('getDashboardData returns empty data for unknown guild', async () => {
  const data = await manager.getDashboardData('unknown-guild-999');
  assert.ok(data && typeof data === 'object');
  assert.ok(Array.isArray(data.trackedGames));
  assert.strictEqual(data.trackedGames.length, 0);
  assert.ok(Array.isArray(data.previews));
});

// ============================================================
console.log('\n=== Module Constants ===');
// ============================================================

test('Module source file contains SPECIAL_TRACKED_SOURCES', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
    'utf8'
  );

  assert.ok(
    source.includes('SPECIAL_TRACKED_SOURCES'),
    'Source should define SPECIAL_TRACKED_SOURCES'
  );

  // Verify all new game sources are present
  const newGames = [
    'overwatch',
    'apex',
    'cs2',
    'dota2',
    'valheim',
    'rust',
    'pubg',
    'nvidia',
    'amd',
    'intel',
  ];
  for (const game of newGames) {
    // Keys can be quoted or unquoted in the object literal
    assert.ok(
      source.includes(`'${game}'`) || source.includes(`${game}:`),
      `Source should have entry for ${game}`
    );
  }
});

test('Module source has MAX_TRACKED_GAMES = 25', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
    'utf8'
  );
  assert.ok(source.includes('MAX_TRACKED_GAMES = 25'), 'MAX_TRACKED_GAMES should be 25');
});

test('Module source uses SPECIAL_PROVIDER_FETCHERS lookup table', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
    'utf8'
  );

  assert.ok(
    source.includes('SPECIAL_PROVIDER_FETCHERS'),
    'Should define SPECIAL_PROVIDER_FETCHERS'
  );

  // Verify all providers are in the lookup table. Assert on the table's own
  // body rather than on a fixed indentation / fetch-function name, which the
  // descriptive fetch* names no longer match.
  const tableMatch = source.match(/const SPECIAL_PROVIDER_FETCHERS = \{([\s\S]*?)\n\};/);
  assert.ok(tableMatch, 'SPECIAL_PROVIDER_FETCHERS should be an object literal');
  const tableBody = tableMatch[1];

  const providers = [
    'minecraft',
    'league',
    'osu',
    'valorant',
    'ffxiv',
    'wow',
    'poe',
    'fortnite',
    'helldivers2',
    'diablo',
    'overwatch',
    'apex',
    'nvidia',
    'amd',
    'intel',
  ];
  for (const p of providers) {
    assert.ok(
      new RegExp(`^\\s*${p}\\s*:`, 'm').test(tableBody),
      `SPECIAL_PROVIDER_FETCHERS should include ${p}`
    );
  }
});

test('Module source has createGenericWebFetcher factory', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
    'utf8'
  );
  assert.ok(
    source.includes('function createGenericWebFetcher'),
    'Should define createGenericWebFetcher'
  );
  // decodeEntities moved to steamUpdateUtils.js during the Phase 4 split.
  const utilsSource = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamUpdateUtils.js'),
    'utf8'
  );
  assert.ok(
    utilsSource.includes('function decodeEntities') || source.includes('function decodeEntities'),
    'Should define decodeEntities'
  );
});

test('Module source embed builder uses fields for version and date', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
    'utf8'
  );

  // Check that createUpdateEmbed adds fields
  assert.ok(source.includes("'Version'"), 'Embed should add Version field');
  assert.ok(source.includes("'Released'"), 'Embed should add Released field');
  assert.ok(source.includes("'Store'"), 'Embed should add Store field');
  assert.ok(source.includes('setAuthor'), 'Embed should use setAuthor for game name');
  assert.ok(source.includes('setThumbnail'), 'Embed should use setThumbnail');
  assert.ok(source.includes('setImage'), 'Embed should use setImage for banner');
});

// ============================================================
console.log('\n=== Command Description ===');
// ============================================================

test('steamupdates command description includes all new games', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'commands', 'admin', 'steamupdates.js'),
    'utf8'
  );

  const games = ['Overwatch 2', 'Apex Legends', 'CS2', 'Dota 2', 'Valheim', 'Rust', 'PUBG'];
  for (const game of games) {
    assert.ok(source.includes(game), `Command description should mention ${game}`);
  }
});

test('steamupdates command usage includes new game names', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'commands', 'admin', 'steamupdates.js'),
    'utf8'
  );

  const identifiers = ['cs2', 'dota2', 'valheim', 'rust', 'pubg', 'overwatch', 'apex'];
  for (const id of identifiers) {
    assert.ok(source.includes(id), `Usage should include ${id}`);
  }
});

// ============================================================
console.log('\n=== Dashboard View ===');
// ============================================================

test('Dashboard EJS includes all special source defaults', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'),
    'utf8'
  );

  assert.ok(source.includes('specialSourceDefaults'), 'Should define specialSourceDefaults');

  const sources = [
    'minecraft',
    'osu',
    'league',
    'valorant',
    'ffxiv',
    'wow',
    'poe',
    'fortnite',
    'helldivers2',
    'diablo',
    'overwatch',
    'apex',
    'cs2',
    'dota2',
    'valheim',
    'rust',
    'pubg',
  ];
  for (const s of sources) {
    assert.ok(source.includes(`${s}:`), `Dashboard should have quick-add entry for ${s}`);
  }
});

test('Dashboard EJS escapeHtml uses split/join pattern', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'),
    'utf8'
  );

  // The fix was to use split().join() instead of replaceAll() which isn't available in all envs
  assert.ok(
    source.includes('.split(AMP).join('),
    'escapeHtml should use split/join pattern for ampersand'
  );
  assert.ok(
    source.includes('.split(LT).join('),
    'escapeHtml should use split/join pattern for less-than'
  );
});

test('Dashboard EJS textarea placeholder includes all game names', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'),
    'utf8'
  );

  const names = [
    'minecraft',
    'osu',
    'lol',
    'valorant',
    'ffxiv',
    'wow',
    'poe',
    'fortnite',
    'helldivers2',
    'diablo',
    'overwatch',
    'apex',
    'cs2',
    'dota2',
    'valheim',
    'rust',
    'pubg',
  ];
  for (const name of names) {
    assert.ok(source.includes(name), `Placeholder should include ${name}`);
  }
});

test('Dashboard supports up to 25 sources', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'),
    'utf8'
  );
  assert.ok(
    source.includes('selectedGames.size >= 25') ||
      source.includes('max.*25') ||
      source.includes("'25'"),
    'Dashboard should enforce 25 game limit'
  );
});

// ============================================================
console.log('\n=== Provider Sources ===');
// ============================================================

const managerSource = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'utils', 'steam', 'steamGameUpdatesManager.js'),
  'utf8'
);

test('Provider endpoints point at live pages', () => {
  const live = [
    'https://api.github.com/repos/ppy/osu/releases',
    'https://fortnite-api.com/v2/news',
    'https://www.pathofexile.com/news/rss',
    'https://worldofwarcraft.blizzard.com/en-us/news',
    'https://news.blizzard.com/en-us/diablo4',
    'intel-arc-iris-xe-graphics-windows.html',
  ];
  for (const url of live) {
    assert.ok(managerSource.includes(url), `Expected live endpoint ${url}`);
  }
});

test('Dead provider endpoints are gone', () => {
  const dead = [
    'https://us.battle.net/news/en-us/wow/',
    'https://www.pathofexile.com/en/news',
    'https://diablo4.blizzard.com/en-us/news/',
    'osu.ppy.sh/api/v2/changelog',
    'release-notes/RN-RAD-WIN.html',
  ];
  for (const url of dead) {
    assert.ok(!managerSource.includes(url), `Dead endpoint still referenced: ${url}`);
  }
});

test('parseRssFeed extracts title, link and date from RSS items', () => {
  const { parseRssFeed } = require('../utils/steam/steamUpdateUtils');
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
    <item>
      <title><![CDATA[Patch 3.26 Notes]]></title>
      <link>https://example.com/news/326</link>
      <description><![CDATA[<p>Balance changes &amp; fixes</p>]]></description>
      <pubDate>Fri, 13 Nov 2026 19:07:06 +0000</pubDate>
    </item>
    <item>
      <title>Second item</title>
      <link>https://example.com/news/325</link>
    </item>
  </channel></rss>`;

  const items = parseRssFeed(xml);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, 'Patch 3.26 Notes');
  assert.strictEqual(items[0].link, 'https://example.com/news/326');
  assert.ok(items[0].description.includes('Balance changes & fixes'));
  assert.strictEqual(items[0].pubDate, 'Fri, 13 Nov 2026 19:07:06 +0000');
  assert.strictEqual(items[1].pubDate, null);
});

test('parseRssFeed returns [] for empty input', () => {
  const { parseRssFeed } = require('../utils/steam/steamUpdateUtils');
  assert.deepStrictEqual(parseRssFeed(''), []);
  assert.deepStrictEqual(parseRssFeed('<html><body>not a feed</body></html>'), []);
});

// ============================================================
console.log('\n=== Config Updates ===');
// ============================================================

test('Channel-only config update does not throw without tracked games', async () => {
  const guildId = 'test-guild-channel-only';
  const originalSave = manager.save;
  manager.save = async () => {};

  try {
    const result = await manager.updateGuildConfig(guildId, '123456789', undefined, {
      enabled: true,
    });
    assert.ok(result.config, 'Should return a config');
    assert.strictEqual(result.config.channelId, '123456789');
    assert.strictEqual(result.config.enabled, true);
    assert.deepStrictEqual(result.trackedGames, []);
  } finally {
    delete manager.data.guilds[guildId];
    manager.save = originalSave;
  }
});

test('Channel-only update keeps previously tracked games', async () => {
  const guildId = 'test-guild-keep-games';
  const originalSave = manager.save;
  const originalFetchDetails = manager.fetchGameDetails;
  const originalFetchUpdates = manager.fetchUpdatesForGame;
  manager.save = async () => {};
  manager.fetchGameDetails = async (appId) => ({ provider: 'steam', appId, name: `App ${appId}` });
  manager.fetchUpdatesForGame = async () => [];

  try {
    manager.data.guilds[guildId] = {
      enabled: true,
      channelId: '111',
      appIds: ['730'],
      trackedGames: [{ provider: 'steam', appId: '730', name: 'Counter-Strike 2' }],
      rawGames: '730',
      lastSeenArticles: { 'steam:730': 'abc' },
      lastCheckedAt: null,
    };

    const result = await manager.updateGuildConfig(guildId, '222', undefined, { enabled: true });
    assert.strictEqual(result.config.channelId, '222');
    assert.strictEqual(result.config.trackedGames.length, 1);
    assert.strictEqual(result.config.trackedGames[0].appId, '730');
    assert.deepStrictEqual(result.config.appIds, ['730']);
  } finally {
    delete manager.data.guilds[guildId];
    manager.save = originalSave;
    manager.fetchGameDetails = originalFetchDetails;
    manager.fetchUpdatesForGame = originalFetchUpdates;
  }
});

// ============================================================
// Results
// ============================================================

// Wait for every (possibly async) test before reporting, otherwise the summary
// would print while assertions are still in flight.
Promise.all(pending).then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
});
