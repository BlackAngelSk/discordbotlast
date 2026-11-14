/**
 * Tests for the /dashboard hub and the extracted settings engine.
 * Static checks (no live Discord): the interactive flow is driven by the
 * simulation harness documented in the discordbotlast-dev skill.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

const hub = require('../utils/panel/hub');
const engine = require('../utils/panel/settingsEngine');
const dashboardCmd = require('../slashCommands/admin/dashboard');
const setupCmd = require('../slashCommands/admin/setup');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  const run = Promise.resolve()
    .then(() => fn())
    .then(
      () => {
        passed += 1;
        console.log(`  ✅ ${name}`);
      },
      (error) => {
        failed += 1;
        console.log(`  ❌ ${name}`);
        console.log(`     ${error.message}`);
      }
    );
  pending.push(run);
  return run;
}

const guild = {
  id: 'guild-123',
  name: 'Test Server',
  memberCount: 42,
  iconURL: () => 'https://cdn.discordapp.com/icons/123/abc.png',
};

console.log('\n=== Settings engine ===');

test('engine exposes the full category catalog', () => {
  assert.strictEqual(engine.CATEGORY_IDS.length, 16);
  assert.ok(engine.CATEGORY_IDS.includes('welcome'));
  assert.ok(engine.CATEGORY_IDS.includes('alerts'));
  assert.ok(engine.CATEGORY_IDS.includes('steam'));
  assert.ok(engine.CATEGORY_IDS.includes('telegram'));
  assert.ok(engine.CATEGORY_IDS.includes('season'));
});

test('every category has settings with unique keys', () => {
  for (const category of engine.CATEGORY_IDS) {
    const list = engine.SETTINGS[category] || [];
    assert.ok(list.length > 0, `${category} has no settings`);
    const keys = list.map((s) => s.key);
    assert.strictEqual(new Set(keys).size, keys.length, `${category} has duplicate keys`);
    for (const setting of list) {
      assert.ok(setting.label, `${category}/${setting.key} is missing a label`);
      assert.ok(setting.kind, `${category}/${setting.key} is missing a kind`);
    }
  }
});

test('engine keeps the setup: customId contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'panel', 'settingsEngine.js'),
    'utf8'
  );
  assert.ok(source.includes("i.customId.startsWith('setup:')"), 'component filter changed');
  assert.ok(source.includes('setup:${s.kind}:__cat__:${s.key}:${token}'), 'setting ids changed');
});

test('engine still supports the modal-based value editors', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'utils', 'panel', 'settingsEngine.js'),
    'utf8'
  );
  for (const kind of ['string', 'number', 'json', 'text']) {
    assert.ok(source.includes(`'${kind}'`), `kind ${kind} disappeared`);
  }
  assert.ok(source.includes('showModal'), 'modal editing disappeared');
});

console.log('\n=== Hub rendering ===');

test('hub embed names the server and lists the panels', () => {
  const json = hub.buildHubEmbed(guild, { ws: { ping: 37 } }).toJSON();
  assert.strictEqual(json.author.name, 'Server dashboard');
  assert.ok(json.title.includes('Test Server'));
  const labels = json.fields.map((f) => f.name);
  assert.ok(labels.includes('⚙️ Settings panels'));
  assert.ok(labels.includes('👥 Members'));
  assert.ok(labels.includes('📡 Gateway'));
});

test('hub menu offers every settings category plus custom panels', () => {
  const rows = hub.buildHubRows(guild, 'tok');
  const menu = rows[0].components[0];
  const options = menu.options.map((o) => o.data.value);
  const expected = [...engine.CATEGORY_IDS, ...hub.CUSTOM_PANELS.map((p) => p.value)];
  assert.deepStrictEqual(options.sort(), expected.sort());
  assert.ok(menu.options.length <= 25, 'Discord caps select menus at 25 options');
});

test('hub buttons cover view, refresh and close', () => {
  const rows = hub.buildHubRows(guild, 'tok');
  const ids = rows[1].components.map((b) => b.data.custom_id);
  assert.deepStrictEqual(ids, [
    'dashboard:view:tok',
    'dashboard:refresh:tok',
    'dashboard:close:tok',
  ]);
});

test('panel ids are unique and resolvable', () => {
  const panels = hub.listPanels();
  const ids = panels.map((p) => p.value);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const panel of panels) {
    const custom = String(panel.value).startsWith('custom:');
    assert.ok(custom || engine.CATEGORY_IDS.includes(panel.value), `unknown panel ${panel.value}`);
    assert.ok(panel.emoji && panel.label && panel.description);
  }
});

console.log('\n=== Settings view ===');

test('settings rows cover the whole catalog', () => {
  const rows = hub.buildSettingRows('guild-123');
  assert.ok(rows.length >= engine.CATEGORY_IDS.length, `only ${rows.length} rows`);
  assert.ok(rows.every((r) => r.category && r.label && typeof r.value === 'string'));
});

test('settings pages paginate and clamp the footer', () => {
  const rows = hub.buildSettingRows('guild-123');
  const totalPages = Math.max(1, Math.ceil(rows.length / engine.VIEW_PAGE_SIZE));
  const page = hub.buildSettingsPage(guild, rows, 0, totalPages).toJSON();

  assert.ok(page.footer.text.startsWith(`Page 1/${totalPages}`));
  assert.ok(page.fields.length <= engine.VIEW_PAGE_SIZE);
});

test('nav disables prev on the first page and next on the last', () => {
  const first = hub.buildSettingsNav('tok', 0, 3).components;
  assert.strictEqual(first[0].data.disabled, true);
  assert.strictEqual(first[1].data.disabled, false);

  const last = hub.buildSettingsNav('tok', 2, 3).components;
  assert.strictEqual(last[0].data.disabled, false);
  assert.strictEqual(last[1].data.disabled, true);
  assert.strictEqual(last[2].data.custom_id, 'dashboard:back:tok');
});

console.log('\n=== Commands ===');

test('/dashboard is registered as an admin command', () => {
  const json = dashboardCmd.data.toJSON();
  assert.strictEqual(json.name, 'dashboard');
  assert.strictEqual(json.default_member_permissions, '8');
  assert.ok(json.description.length > 0);
});

test('/setup is a thin alias with view/config/reset', () => {
  const json = setupCmd.data.toJSON();
  assert.strictEqual(json.name, 'setup');
  const subs = json.options.map((o) => o.name).sort();
  assert.deepStrictEqual(subs, ['config', 'reset', 'view']);
});

test('/setup no longer carries its own settings catalog', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'slashCommands', 'admin', 'setup.js'),
    'utf8'
  );
  assert.ok(source.length < 20000, `setup.js is ${source.length} bytes — catalog not extracted`);
  assert.ok(source.includes("require('../../utils/panel/settingsEngine')"));
  assert.ok(source.includes("require('../../utils/panel/hub')"));
});

console.log('\n=== Economy panel ===');

test('economy embed shows the leaderboard and season status', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const json = economyPanel.buildMainEmbed(guild).toJSON();

  assert.strictEqual(json.title, '💰 Economy');
  assert.ok(json.description.length > 0);
  const names = json.fields.map((f) => f.name);
  assert.ok(names.includes('🏆 Season board'));
  assert.ok(names.includes('⏱️ Refresh'));
  assert.ok(names.includes('📐 Mode'));
});

test('economy buttons cover give, take, season, refresh and back', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const row = economyPanel.buildMainRows('tok')[0];
  const ids = row.components.map((b) => b.data.custom_id);
  assert.deepStrictEqual(ids, [
    'econ:give:tok',
    'econ:take:tok',
    'econ:season:tok',
    'econ:refresh:tok',
    'econ:back:tok',
  ]);
});

test('economy uses a user picker and an amount modal', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const picker = economyPanel.buildUserPicker('give', 'tok');
  const select = picker.components[0].components[0];
  assert.strictEqual(select.data.custom_id, 'econ:user:give:tok');
  assert.strictEqual(select.data.max_values, 1);

  const modal = economyPanel.buildAmountModal('take', 'tok').toJSON();
  assert.strictEqual(modal.custom_id, 'econ:amount:take:tok');
  assert.strictEqual(modal.components[0].components[0].custom_id, 'amount');
});

test('season settings patch the leaderboard config', async () => {
  const seasonMgr = require('../utils/seasonLeaderboardManager');
  const originalOptions = seasonMgr.setLeaderboardOptions;
  const originalChannel = seasonMgr.setLeaderboardChannel;
  const calls = [];
  seasonMgr.setLeaderboardOptions = async (guildId, options) => calls.push(options);
  seasonMgr.setLeaderboardChannel = async (guildId, channelId) => calls.push({ channelId });

  try {
    await engine.SETTINGS.season.find((s) => s.key === 'seasonInterval').write('guild-123', 30);
    await engine.SETTINGS.season
      .find((s) => s.key === 'seasonChannel')
      .write('guild-123', 'chan-9');
    assert.deepStrictEqual(calls[0], { updateIntervalMinutes: 30 });
    assert.deepStrictEqual(calls[1], { channelId: 'chan-9' });
  } finally {
    seasonMgr.setLeaderboardOptions = originalOptions;
    seasonMgr.setLeaderboardChannel = originalChannel;
  }
});

console.log('\n=== Safety panel ===');

test('safety embed shows raid, verification, starboard and lockdown', () => {
  const safetyPanel = require('../utils/panel/safetyPanel');
  const json = safetyPanel.buildMainEmbed(guild).toJSON();

  assert.ok(/Safety|locked down/i.test(json.title), json.title);
  const names = json.fields.map((f) => f.name);
  for (const expected of ['🚨 Raid protection', '✅ Verification', '⭐ Starboard', '🔒 Lockdown']) {
    assert.ok(names.includes(expected), `missing field ${expected}`);
  }
});

test('safety buttons flip with the lockdown state', () => {
  const raid = require('../utils/raidProtectionManager');
  const original = raid.isLocked;
  try {
    raid.isLocked = () => false;
    let labels = require('../utils/panel/safetyPanel')
      .buildMainRows(guild, 'tok')[0]
      .components.map((b) => b.data.label);
    assert.ok(labels.includes('Start lockdown'), labels.join(','));

    raid.isLocked = () => true;
    labels = require('../utils/panel/safetyPanel')
      .buildMainRows(guild, 'tok')[0]
      .components.map((b) => b.data.label);
    assert.ok(labels.includes('Lift lockdown'), labels.join(','));
  } finally {
    raid.isLocked = original;
  }
});

test('safety panel writes lockdown through the raid manager', async () => {
  const raid = require('../utils/raidProtectionManager');
  const originalLocked = raid.isLocked;
  const originalSet = raid.setLockdown;
  const calls = [];
  raid.isLocked = () => false;
  raid.setLockdown = async (guildId, locked) => calls.push({ guildId, locked });

  try {
    const safetyPanel = require('../utils/panel/safetyPanel');
    const updates = [];
    const components = [];
    const guildObj = { ...guild, id: 'guild-123' };

    const fakeChannel = {
      awaitMessageComponent: async () => {
        if (components.length) return components.shift();
        const lockedNow = calls.length > 0 ? calls[calls.length - 1].locked : false;
        return {
          customId: lockedNow ? 'safety:back:tok' : 'safety:lockdown:tok',
          user: { id: 'admin' },
          update: async (payload) => {
            updates.push(payload);
            components.push({
              customId: 'safety:back:tok',
              user: { id: 'admin' },
              update: async () => {},
              deferUpdate: async () => {},
            });
          },
          deferUpdate: async () => {},
          reply: async () => {},
        };
      },
    };

    const interaction = {
      guild: guildObj,
      guildId: 'guild-123',
      channel: fakeChannel,
      user: { id: 'admin' },
      editReply: async () => {},
    };

    const result = await safetyPanel.runSafetyPanel({
      interaction,
      guild: guildObj,
      userId: 'admin',
      token: 'tok',
      firstUpdate: { update: async () => {} },
    });

    assert.deepStrictEqual(calls, [{ guildId: 'guild-123', locked: true }]);
    assert.strictEqual(result, 'back');
  } finally {
    raid.isLocked = originalLocked;
    raid.setLockdown = originalSet;
  }
});

console.log('\n=== Server builder panel ===');

test('builder embed counts resources and shows permissions', () => {
  const builder = require('../utils/panel/serverBuilderPanel');
  const guildWithChannels = {
    ...guild,
    channels: {
      cache: new Collection([
        ['1', { type: 4 }], // category
        ['2', { type: 0 }], // text
      ]),
    },
    roles: { cache: new Collection([['guild-123', { id: 'guild-123' }]]) },
    members: { me: { permissions: { has: () => true } } },
  };
  const json = builder.buildMainEmbed(guildWithChannels).toJSON();
  const names = json.fields.map((f) => f.name);
  assert.ok(names.includes('📁 Categories'));
  assert.ok(names.includes('💬 Text channels'));
  assert.ok(names.includes('🏷️ Roles'));
  assert.ok(json.fields.find((f) => f.name === '📁 Categories').value === '1');
});

test('builder disables buttons without bot permissions', () => {
  const builder = require('../utils/panel/serverBuilderPanel');
  const noPerms = { ...guild, members: { me: { permissions: { has: () => false } } } };
  const buttons = builder.buildMainRows(noPerms, 'tok')[0].components;
  const byId = Object.fromEntries(buttons.map((b) => [b.data.custom_id, b.data.disabled]));
  assert.strictEqual(byId['build:category:tok'], true);
  assert.strictEqual(byId['build:channel:tok'], true);
  assert.strictEqual(byId['build:role:tok'], true);
  assert.strictEqual(byId['build:back:tok'], undefined);
});

test('builder modals ask for a name and an optional role colour', () => {
  const builder = require('../utils/panel/serverBuilderPanel');
  const roleModal = builder.buildCreateModal('role', 'tok').toJSON();
  assert.strictEqual(roleModal.custom_id, 'build:create:role:tok');
  assert.strictEqual(roleModal.components.length, 2);
  assert.strictEqual(roleModal.components[1].components[0].custom_id, 'color');

  const channelModal = builder.buildCreateModal('channel', 'tok').toJSON();
  assert.strictEqual(channelModal.components.length, 1);
});

test('builder sanitizes names and colours', () => {
  const builder = require('../utils/panel/serverBuilderPanel');
  assert.strictEqual(builder.sanitizeName('  Event  Chat  ', 'channel'), 'Event-Chat');
  assert.strictEqual(builder.sanitizeName('  Event  Chat  ', 'category'), 'Event Chat');
  assert.strictEqual(builder.parseColor('#5865F2'), 0x5865f2);
  assert.strictEqual(builder.parseColor('nope'), null);
});

console.log('\n=== Steam deal filters ===');

test('steam filter writes are blocked until a deals channel exists', async () => {
  const steamMgr = require('../utils/steam/steamFreeGamesAlertsManager');
  const originalGet = steamMgr.getPromoGuildConfig;
  steamMgr.getPromoGuildConfig = () => null;

  try {
    const setting = engine.SETTINGS.steam.find((s) => s.key === 'minDiscountPercent');
    await assert.rejects(() => setting.write('guild-123', 40), /deals channel first/i);
  } finally {
    steamMgr.getPromoGuildConfig = originalGet;
  }
});

test('steam filter writes patch the promo config', async () => {
  const steamMgr = require('../utils/steam/steamFreeGamesAlertsManager');
  const originalGet = steamMgr.getPromoGuildConfig;
  const originalUpdate = steamMgr.updatePromoConfig;
  const patches = [];
  steamMgr.getPromoGuildConfig = () => ({ channelId: 'chan-1' });
  steamMgr.updatePromoConfig = async (guildId, patch) => {
    patches.push(patch);
    return patch;
  };

  try {
    const setting = engine.SETTINGS.steam.find((s) => s.key === 'minDiscountPercent');
    await setting.write('guild-123', 40);
    assert.deepStrictEqual(patches[0], { minDiscountPercent: 40 });
  } finally {
    steamMgr.getPromoGuildConfig = originalGet;
    steamMgr.updatePromoConfig = originalUpdate;
  }
});

test('steam channel clear only disables promo alerts', async () => {
  const steamMgr = require('../utils/steam/steamFreeGamesAlertsManager');
  const originalEnable = steamMgr.enablePromoAlerts;
  const originalDisable = steamMgr.disablePromoAlerts;
  const originalDisableAll = steamMgr.disableAlerts;
  const calls = [];
  steamMgr.enablePromoAlerts = async () => calls.push('enable');
  steamMgr.disablePromoAlerts = async () => calls.push('disablePromo');
  steamMgr.disableAlerts = async () => calls.push('disableAll');

  try {
    const setting = engine.SETTINGS.steam.find((s) => s.key === 'steamPromoDealsChannel');
    await setting.write('guild-123', null);
    assert.deepStrictEqual(calls, ['disablePromo']);
  } finally {
    steamMgr.enablePromoAlerts = originalEnable;
    steamMgr.disablePromoAlerts = originalDisable;
    steamMgr.disableAlerts = originalDisableAll;
  }
});

test('telegram settings read the sync manager config', () => {
  const telegram = require('../utils/status/telegramSyncManager');
  const config = telegram.getGuildConfig('guild-123');
  const setting = engine.SETTINGS.telegram.find((s) => s.key === 'telegramEnabled');
  assert.strictEqual(setting.read('guild-123'), Boolean(config.enabled));
});

Promise.all(pending).then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
});
