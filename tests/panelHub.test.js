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
  const expected = [
    ...engine.CATEGORY_IDS,
    ...hub.CUSTOM_PANELS.filter((p) => !p.ownerOnly).map((p) => p.value),
  ];
  assert.deepStrictEqual(options.sort(), expected.sort());
  assert.ok(menu.options.length <= 25, 'Discord caps select menus at 25 options');
});

test('owner-only panels are listed only for BOT_OWNER_ID', () => {
  const original = process.env.BOT_OWNER_ID;
  process.env.BOT_OWNER_ID = 'owner-1';
  try {
    assert.ok(hub.listPanels('owner-1').some((p) => p.value === 'custom:owner'));
    assert.ok(!hub.listPanels('member-1').some((p) => p.value === 'custom:owner'));

    const ownerMenu = hub.buildHubRows(guild, 'tok', 'owner-1')[0].components[0];
    assert.ok(ownerMenu.options.some((o) => o.data.value === 'custom:owner'));
    const memberMenu = hub.buildHubRows(guild, 'tok', 'member-1')[0].components[0];
    assert.ok(!memberMenu.options.some((o) => o.data.value === 'custom:owner'));
  } finally {
    if (original === undefined) delete process.env.BOT_OWNER_ID;
    else process.env.BOT_OWNER_ID = original;
  }
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

test('economy buttons cover give, take, season, shop, global, refresh and back', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const ids = economyPanel
    .buildMainRows('tok')
    .flatMap((row) => row.components.map((b) => b.data.custom_id));
  assert.deepStrictEqual(ids, [
    'econ:give:tok',
    'econ:take:tok',
    'econ:season:tok',
    'econ:shop:tok',
    'econ:refresh:tok',
    'econ:global:tok',
    'econ:back:tok',
  ]);
});

test('economy global board renders the cross-server top list', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const econManager = require('../utils/economyManager');
  const original = econManager.getGlobalLeaderboard;
  econManager.getGlobalLeaderboard = () => [
    { userId: 'u1', balance: 12345 },
    { userId: 'u2', balance: 900 },
  ];

  try {
    const json = economyPanel.buildGlobalEmbed().toJSON();
    assert.strictEqual(json.title, '🌍 Global leaderboard');
    assert.ok(json.description.includes('<@u1>'));
    assert.ok(json.description.includes('12,345'));
    const ids = economyPanel.buildGlobalRows('tok')[0].components.map((b) => b.data.custom_id);
    assert.deepStrictEqual(ids, ['econ:globalrefresh:tok', 'econ:globalback:tok']);
  } finally {
    econManager.getGlobalLeaderboard = original;
  }
});

test('economy shop view lists items and offers add/remove', () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const econManager = require('../utils/economyManager');
  const original = econManager.getShopItems;
  econManager.getShopItems = () => [
    { id: 'vip', name: 'VIP Role', price: 10000, type: 'role', description: 'VIP' },
  ];

  try {
    const json = economyPanel.buildShopEmbed(guild).toJSON();
    assert.strictEqual(json.title, '🛍️ Shop items');
    assert.ok(json.description.includes('VIP Role'));
    assert.ok(json.description.includes('vip'));

    const ids = economyPanel
      .buildShopRows('tok')
      .flatMap((row) => row.components.map((b) => b.data.custom_id));
    assert.deepStrictEqual(ids, ['econ:shopadd:tok', 'econ:shopremove:tok', 'econ:shopback:tok']);

    const modal = economyPanel.buildShopItemModal('tok').toJSON();
    assert.strictEqual(modal.custom_id, 'econ:shopcreate:tok');
    assert.deepStrictEqual(
      modal.components.map((row) => row.components[0].custom_id),
      ['name', 'price', 'itemId', 'type', 'description']
    );

    const select = economyPanel.buildShopItemSelect(econManager.getShopItems('g'), 'tok');
    assert.deepStrictEqual(
      select.components[0].options.map((o) => o.data.value),
      ['vip']
    );
  } finally {
    econManager.getShopItems = original;
  }
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

console.log('\n=== Insights panel ===');

test('insights renders three distinct views', async () => {
  const insights = require('../utils/panel/insightsPanel');
  const analytics = require('../utils/analyticsManager');
  const original = analytics.getDashboardData;
  analytics.getDashboardData = async () => ({
    overview: { messages: 1200, commands: 88, members: 40 },
    topCommands: [
      { command: 'daily', count: 30 },
      { command: 'play', count: 12 },
    ],
    engagement: { score: 99, trend: 'up' },
    dailyActivity: {},
  });

  try {
    const client = { uptime: 3 * 3600 * 1000, ws: { ping: 12 }, guilds: { cache: { size: 2 } } };

    const overview = (await insights.buildEmbed(guild, 'overview', client)).toJSON();
    assert.strictEqual(overview.title, '📊 Server insights');
    assert.ok(overview.fields.some((f) => f.name === '💬 Messages' && f.value === '1,200'));
    assert.ok(overview.fields.some((f) => /daily/.test(f.value)));

    const activity = (await insights.buildEmbed(guild, 'activity', client)).toJSON();
    assert.strictEqual(activity.title, '📈 Message activity');
    assert.ok(activity.fields.some((f) => f.name === '📅 Last 7 days'));

    const health = (await insights.buildEmbed(guild, 'health', client)).toJSON();
    assert.strictEqual(health.title, '🩺 Bot health');
    assert.ok(health.fields.some((f) => f.name === '⏱️ Uptime' && f.value === '3h 0m'));
    assert.ok(health.fields.some((f) => f.name === '🏠 Servers' && f.value === '2'));
  } finally {
    analytics.getDashboardData = original;
  }
});

test('insights never shows the random engagement score', async () => {
  const insights = require('../utils/panel/insightsPanel');
  const analytics = require('../utils/analyticsManager');
  const original = analytics.getDashboardData;
  analytics.getDashboardData = async () => ({
    overview: {},
    topCommands: [],
    engagement: { score: 97, trend: 'up' },
  });

  try {
    const json = (await insights.buildEmbed(guild, 'overview', {})).toJSON();
    assert.ok(
      !JSON.stringify(json).includes('Engagement'),
      'random engagement leaked into the panel'
    );
  } finally {
    analytics.getDashboardData = original;
  }
});

test('insights helper maths', () => {
  const insights = require('../utils/panel/insightsPanel');
  assert.strictEqual(insights.formatUptime(90 * 60 * 1000), '1h 30m');
  assert.strictEqual(insights.formatUptime(26 * 3600 * 1000), '1d 2h');
  const days = insights.recentDays({}, 7);
  assert.strictEqual(days.length, 7);
  assert.ok(days.every((d) => d.count === 0));
});

test('insights buttons disable the active view', () => {
  const insights = require('../utils/panel/insightsPanel');
  const rows = insights.buildRows('activity', 'tok');
  const ids = rows[0].components.map((b) => b.data.custom_id);
  assert.deepStrictEqual(ids, [
    'insights:overview:tok',
    'insights:activity:tok',
    'insights:health:tok',
    'insights:back:tok',
  ]);
  const activity = rows[0].components.find((b) => b.data.custom_id === 'insights:activity:tok');
  assert.strictEqual(activity.data.disabled, true);
});

console.log('\n=== Community panel ===');

test('community panel summarises tickets and suggestions', () => {
  const community = require('../utils/panel/communityPanel');
  const tickets = require('../utils/automation/ticketManager');
  const suggestions = require('../utils/automation/suggestionManager');
  const originalTickets = tickets.getGuildTickets;
  const originalSuggestions = suggestions.getGuildSuggestions;

  tickets.getGuildTickets = () => ({
    1: { channelId: 'chan-1', status: 'open' },
    2: { channelId: 'chan-2', status: 'closed' },
  });
  suggestions.getGuildSuggestions = () => [
    { id: 'a1', content: 'Add a movie night', status: 'pending', upvotes: 5 },
    { id: 'a2', content: 'More emojis', status: 'approved', upvotes: 2 },
  ];

  try {
    const json = community.buildEmbed(guild).toJSON();
    const fields = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
    assert.strictEqual(fields['🎟️ Open tickets'], '1');
    assert.strictEqual(fields['🗂️ Total tickets'], '2');
    assert.ok(fields['📨 Suggestions'].includes('1 pending'));
    assert.ok(fields['💡 Top suggestions'].includes('Add a movie night'));
  } finally {
    tickets.getGuildTickets = originalTickets;
    suggestions.getGuildSuggestions = originalSuggestions;
  }
});

test('community buttons link the settings categories', () => {
  const community = require('../utils/panel/communityPanel');
  const ids = community.buildRows('tok')[0].components.map((b) => b.data.custom_id);
  assert.deepStrictEqual(ids, [
    'community:tickets:tok',
    'community:suggestions:tok',
    'community:refresh:tok',
    'community:back:tok',
  ]);
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

console.log('\n=== Alert test actions ===');

test('alerts category exposes the four test-alert actions', () => {
  const actions = engine.SETTINGS.alerts.filter((s) => s.kind === 'action');
  assert.strictEqual(actions.length, 4);
  for (const action of actions) {
    assert.strictEqual(typeof action.run, 'function', `${action.key} has no run()`);
    assert.ok(action.hint, `${action.key} needs a hint`);
  }
  assert.strictEqual(engine.readSetting(actions[0], 'guild-123'), undefined);

  const { embed, components } = engine.renderCategory(guild, 'alerts', 'tok');
  const names = embed.toJSON().fields.map((f) => f.name);
  assert.ok(names.includes('🧪 Send test Epic alert'));
  const ids = components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(ids.includes('setup:action:__cat__:previewEpic:tok'));
  assert.ok(ids.includes('setup:back:tok'));
});

test('view-all skips actions but keeps real settings', () => {
  const rows = hub.buildSettingRows('guild-123');
  assert.ok(!rows.some((row) => /Send test/.test(row.label)), 'actions leaked into view all');
  assert.ok(rows.some((row) => row.label === 'Epic Games alerts channel'));
});

test('test actions call the shared senders', async () => {
  const actions = require('../utils/panel/alertTestActions');
  const original = actions.sendEpicTest;
  const calls = [];
  actions.sendEpicTest = async (guildArg, guildId) => {
    calls.push({ guildArg, guildId });
    return 'sent';
  };

  try {
    const setting = engine.SETTINGS.alerts.find((s) => s.key === 'previewEpic');
    const result = await setting.run({ guild, guildId: 'guild-123' });
    assert.strictEqual(result, 'sent');
    assert.strictEqual(calls[0].guildId, 'guild-123');
    assert.strictEqual(calls[0].guildArg, guild);
  } finally {
    actions.sendEpicTest = original;
  }
});

test('message categories expose preview actions that use the caller', async () => {
  const actions = require('../utils/panel/testActions');
  const original = actions.runDashboardTestAction;
  const calls = [];
  actions.runDashboardTestAction = async (args) => {
    calls.push(args);
    return 'sent';
  };

  const member = { id: 'member-1' };
  const guildWithClient = { ...guild, client: { fake: true } };
  const cases = [
    ['welcome', 'welcome'],
    ['leave', 'leave'],
    ['logging', 'logging'],
    ['suggestions', 'suggestions'],
  ];

  try {
    for (const [category, type] of cases) {
      const setting = engine.SETTINGS[category].find((s) => s.kind === 'action');
      assert.ok(setting, `${category} has no preview action`);
      const result = await setting.run({ guild: guildWithClient, guildId: 'guild-123', member });
      assert.strictEqual(result, 'sent');
      const call = calls[calls.length - 1];
      assert.strictEqual(call.type, type);
      assert.strictEqual(call.member, member);
      assert.strictEqual(call.guildId, 'guild-123');
      assert.strictEqual(call.client, guildWithClient.client);
    }

    const { embed } = engine.renderCategory(guild, 'welcome', 'tok');
    const names = embed.toJSON().fields.map((f) => f.name);
    assert.ok(names.includes('🧪 Send test welcome'));
  } finally {
    actions.runDashboardTestAction = original;
  }
});

console.log('\n=== Live alerts panel ===');

test('live alerts embed lists watches, target and API status', () => {
  const live = require('../utils/panel/liveAlertsPanel');
  const mgr = require('../utils/liveAlertsManager');
  const original = mgr.getAlerts;
  mgr.getAlerts = () => ({
    twitch: [{ username: 'streamer', channelId: 'chan-1', roleId: null }],
    youtube: [{ channelId: 'UC123', channelName: 'Creator', discordChannelId: 'chan-1' }],
  });

  try {
    const json = live.buildEmbed(guild, { channelId: 'chan-1', roleId: 'role-1' }).toJSON();
    const fields = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
    assert.ok(fields['🟣 Twitch'].includes('streamer'));
    assert.ok(fields['🔴 YouTube'].includes('Creator'));
    assert.ok(fields['🎯 Target'].includes('<#chan-1>'));
    assert.ok(fields['🎯 Target'].includes('<@&role-1>'));
    assert.ok(/Twitch/.test(fields['🔑 APIs']));

    const options = live.listAlertOptions(guild);
    assert.deepStrictEqual(
      options.map((o) => `${o.platform}:${o.index}`),
      ['twitch:0', 'youtube:0']
    );
  } finally {
    mgr.getAlerts = original;
  }
});

test('live alerts buttons cover add, test, remove and clear', () => {
  const live = require('../utils/panel/liveAlertsPanel');
  const ids = live.buildRows('tok').flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.deepStrictEqual(ids, [
    'live:channel:tok',
    'live:role:tok',
    'live:addtwitch:tok',
    'live:addyoutube:tok',
    'live:test:tok',
    'live:remove:tok',
    'live:clearrole:tok',
    'live:refresh:tok',
    'live:back:tok',
  ]);
});

test('live alerts empty state renders without watches', () => {
  const live = require('../utils/panel/liveAlertsPanel');
  const json = live.buildEmbed(guild, {}).toJSON();
  const fields = Object.fromEntries(json.fields.map((f) => [f.name, f.value]));
  assert.strictEqual(fields['🟣 Twitch'], '*none yet*');
  assert.strictEqual(fields['🔴 YouTube'], '*none yet*');
  assert.strictEqual(fields['🎯 Target'], '*pick a channel below*');
});

console.log('\n=== Owner panel ===');

test('owner panel formats sizes and uptime', () => {
  const owner = require('../utils/panel/ownerPanel');
  assert.strictEqual(owner.formatBytes(0), '0 B');
  assert.strictEqual(owner.formatBytes(1536), '1.5 KB');
  assert.strictEqual(owner.formatUptime(90 * 60), '1h 30m');
  assert.strictEqual(owner.formatUptime(90061), '1d 1h 1m');
});

test('owner panel is gated on BOT_OWNER_ID', () => {
  const owner = require('../utils/panel/ownerPanel');
  const original = process.env.BOT_OWNER_ID;
  process.env.BOT_OWNER_ID = 'owner-1';
  try {
    assert.strictEqual(owner.isOwner('owner-1'), true);
    assert.strictEqual(owner.isOwner('member-1'), false);
    assert.strictEqual(owner.isOwner(null), false);
  } finally {
    if (original === undefined) delete process.env.BOT_OWNER_ID;
    else process.env.BOT_OWNER_ID = original;
  }
});

test('owner panel shows storage, runtime and owner identity', () => {
  const owner = require('../utils/panel/ownerPanel');
  const client = {
    ws: { ping: 21 },
    guilds: { cache: new Map([['g', {}]]) },
    users: { cache: new Map() },
    user: { tag: 'Bot#1' },
  };
  const json = owner.buildEmbed(guild, client).toJSON();
  const names = json.fields.map((f) => f.name);
  for (const expected of ['🗄️ Storage', '🌐 Servers', '🩺 Runtime', '👤 Owner', '📁 Database']) {
    assert.ok(names.includes(expected), `missing field ${expected}`);
  }
  const ids = owner.buildRows('tok')[0].components.map((b) => b.data.custom_id);
  assert.deepStrictEqual(ids, ['owner:notify:tok', 'owner:refresh:tok', 'owner:back:tok']);
});

console.log('\n=== Panel component flows ===');

/**
 * Minimal fake of a message component for the panel loops.
 *
 * @param {string} customId
 * @param {string[]} [values]
 * @param {{ modalSubmit?: any }} [hooks]
 * @returns {any}
 */
function makeClick(customId, values = [], hooks = {}) {
  return {
    customId,
    values,
    user: { id: 'admin' },
    update: async () => {},
    deferUpdate: async () => {},
    reply: async () => {},
    deferReply: async () => {},
    editReply: async () => {},
    followUp: async (payload) => {
      hooks.followUps?.push(payload);
    },
    showModal: async (modal) => {
      hooks.modals?.push(modal);
    },
    awaitModalSubmit: async () => hooks.modalSubmit || null,
  };
}

test('live alerts panel adds and removes watches through the manager', async () => {
  const live = require('../utils/panel/liveAlertsPanel');
  const mgr = require('../utils/liveAlertsManager');
  const original = {
    add: mgr.addTwitchAlert,
    remove: mgr.removeTwitchAlert,
    get: mgr.getAlerts,
  };

  const calls = [];
  let alerts = { twitch: [], youtube: [] };
  mgr.getAlerts = () => alerts;
  mgr.addTwitchAlert = async (guildId, username, channelId, roleId) => {
    calls.push(['add', guildId, username, channelId, roleId]);
    alerts = { twitch: [{ username, channelId, roleId }], youtube: [] };
  };
  mgr.removeTwitchAlert = async (guildId, username) => {
    calls.push(['remove', guildId, username]);
    alerts = { twitch: [], youtube: [] };
  };

  const modalSubmit = {
    customId: 'live:modal:twitch:tok',
    user: { id: 'admin' },
    fields: { getTextInputValue: () => 'newbie' },
    deferUpdate: async () => {},
    followUp: async () => {},
    editReply: async () => {},
    reply: async () => {},
  };

  const steps = [
    makeClick('live:channel:tok', ['chan-1']),
    makeClick('live:role:tok', ['role-1']),
    makeClick('live:addtwitch:tok', [], { modalSubmit }),
    makeClick('live:remove:tok'),
    makeClick('live:removal:tok', ['twitch:0']),
    makeClick('live:back:tok'),
  ];
  const interaction = {
    guild,
    guildId: guild.id,
    channel: { awaitMessageComponent: async () => steps.shift() },
    user: { id: 'admin' },
    editReply: async () => {},
  };

  try {
    const result = await live.runLiveAlertsPanel({
      interaction,
      guild,
      userId: 'admin',
      token: 'tok',
      firstUpdate: { update: async () => {} },
    });

    assert.strictEqual(result, 'back');
    assert.deepStrictEqual(calls[0], ['add', 'guild-123', 'newbie', 'chan-1', 'role-1']);
    assert.deepStrictEqual(calls[1], ['remove', 'guild-123', 'newbie']);
    assert.deepStrictEqual(alerts.twitch, []);
  } finally {
    mgr.addTwitchAlert = original.add;
    mgr.removeTwitchAlert = original.remove;
    mgr.getAlerts = original.get;
  }
});

test('owner panel sends the test DM and returns to the hub', async () => {
  const owner = require('../utils/panel/ownerPanel');
  const originalOwner = process.env.BOT_OWNER_ID;
  process.env.BOT_OWNER_ID = 'admin';

  const sent = [];
  const client = {
    ws: { ping: 3 },
    guilds: { cache: new Map() },
    users: {
      cache: new Map(),
      fetch: async () => ({ username: 'Owner', send: async (payload) => sent.push(payload) }),
    },
    user: { tag: 'Bot#1' },
  };

  const followUps = [];
  const steps = [makeClick('owner:notify:tok', [], { followUps }), makeClick('owner:back:tok')];
  const interaction = {
    guild,
    guildId: guild.id,
    channel: { awaitMessageComponent: async () => steps.shift() },
    user: { id: 'admin' },
    client,
    editReply: async () => {},
  };

  try {
    const result = await owner.runOwnerPanel({
      interaction,
      guild,
      userId: 'admin',
      token: 'tok',
      firstUpdate: { update: async () => {} },
    });

    assert.strictEqual(result, 'back');
    assert.strictEqual(sent.length, 1);
    assert.ok(/test notification/i.test(followUps[0].content), followUps[0].content);
  } finally {
    if (originalOwner === undefined) delete process.env.BOT_OWNER_ID;
    else process.env.BOT_OWNER_ID = originalOwner;
  }
});

test('economy panel adds and removes shop items', async () => {
  const economyPanel = require('../utils/panel/economyPanel');
  const econManager = require('../utils/economyManager');
  const original = {
    get: econManager.getShopItems,
    add: econManager.addShopItem,
    remove: econManager.removeShopItem,
  };

  let items = [];
  const calls = [];
  econManager.getShopItems = () => items;
  econManager.addShopItem = async (guildId, item) => {
    calls.push(['add', guildId, item]);
    items = [...items, item];
  };
  econManager.removeShopItem = async (guildId, itemId) => {
    calls.push(['remove', guildId, itemId]);
    const before = items.length;
    items = items.filter((item) => item.id !== itemId);
    return items.length < before;
  };

  const answers = {
    name: 'Sword',
    price: '500',
    itemId: 'sword',
    type: 'item',
    description: 'A sharp sword',
  };
  const modalSubmit = {
    customId: 'econ:shopcreate:tok',
    user: { id: 'admin' },
    fields: { getTextInputValue: (key) => answers[key] ?? '' },
    reply: async () => {},
  };

  const steps = [
    makeClick('econ:shop:tok'),
    makeClick('econ:shopadd:tok', [], { modalSubmit }),
    makeClick('econ:shopremove:tok'),
    makeClick('econ:shopdelete:tok', ['sword']),
    makeClick('econ:back:tok'),
  ];
  const interaction = {
    guild,
    guildId: guild.id,
    channel: { awaitMessageComponent: async () => steps.shift() },
    user: { id: 'admin' },
    editReply: async () => {},
  };

  try {
    const result = await economyPanel.runEconomyPanel({
      interaction,
      guild,
      userId: 'admin',
      token: 'tok',
      firstUpdate: { update: async () => {} },
    });

    assert.strictEqual(result, 'back');
    assert.deepStrictEqual(calls[0], [
      'add',
      'guild-123',
      { id: 'sword', name: 'Sword', price: 500, type: 'item', description: 'A sharp sword' },
    ]);
    assert.deepStrictEqual(calls[1], ['remove', 'guild-123', 'sword']);
    assert.deepStrictEqual(items, []);
  } finally {
    econManager.getShopItems = original.get;
    econManager.addShopItem = original.add;
    econManager.removeShopItem = original.remove;
  }
});

Promise.all(pending).then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
});
