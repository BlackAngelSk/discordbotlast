/**
 * Tests for the /dashboard hub and the extracted settings engine.
 * Static checks (no live Discord): the interactive flow is driven by the
 * simulation harness documented in the discordbotlast-dev skill.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
  assert.strictEqual(engine.CATEGORY_IDS.length, 15);
  assert.ok(engine.CATEGORY_IDS.includes('welcome'));
  assert.ok(engine.CATEGORY_IDS.includes('alerts'));
  assert.ok(engine.CATEGORY_IDS.includes('steam'));
  assert.ok(engine.CATEGORY_IDS.includes('telegram'));
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

test('hub menu offers every settings category', () => {
  const rows = hub.buildHubRows(guild, 'tok');
  const menu = rows[0].components[0];
  const options = menu.options.map((o) => o.data.value);
  assert.deepStrictEqual(options.sort(), [...engine.CATEGORY_IDS].sort());
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
  const ids = panels.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const panel of panels) {
    assert.ok(engine.CATEGORY_IDS.includes(panel.id), `unknown panel ${panel.id}`);
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
