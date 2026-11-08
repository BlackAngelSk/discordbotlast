/**
 * Tests for free-to-keep alerts in the combined Steam promo channel.
 * Covers: settings default/override, embed labelling, new-game dedupe.
 */
'use strict';

const assert = require('assert');

const manager = require('../utils/steam/steamFreeGamesAlertsManager');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

const GUILD_ID = '__keep_test__';

function makeChannel() {
  const sent = [];
  return {
    sent,
    isTextBased: () => true,
    async send(payload) {
      sent.push(payload);
      return { id: String(sent.length) };
    },
  };
}

function keepGame(id, title, endDate = null) {
  return {
    id,
    title,
    description: 'Free to Keep limited time',
    worth: '$19.99',
    url: `https://store.steampowered.com/app/${id}/`,
    imageUrl: null,
    instructions: 'Add to library',
    publishedDate: null,
    endDate,
    type: 'Game',
    platforms: 'Steam',
  };
}

(async () => {
  // Isolate manager state — never touch data/ on disk
  manager.data = { guilds: {}, promoGuilds: {} };
  manager.save = async () => {};

  console.log('\nsettings');

  await test('free-to-keep defaults to enabled', () => {
    const settings = manager.getPromoDealSettings(GUILD_ID);
    assert.strictEqual(settings.freeToKeepEnabled, true);
  });

  await test('updatePromoConfig can disable it', async () => {
    manager.data.promoGuilds[GUILD_ID] = { channelId: '123' };

    await manager.updatePromoConfig(GUILD_ID, { freeToKeepEnabled: false });

    assert.strictEqual(manager.getPromoDealSettings(GUILD_ID).freeToKeepEnabled, false);

    await manager.updatePromoConfig(GUILD_ID, { freeToKeepEnabled: true });
    assert.strictEqual(manager.getPromoDealSettings(GUILD_ID).freeToKeepEnabled, true);
  });

  console.log('\nbuildCurrentAlert');

  await test('labels the alert as free to keep', () => {
    const snapshot = { freeToKeepGiveaways: [keepGame('1', 'Some Game')] };
    const payload = manager.buildCurrentAlert(snapshot, snapshot.freeToKeepGiveaways, {
      freeToKeep: true,
    });

    const summary = payload.messages[0].embeds[0].toJSON();
    assert.ok(summary.title.includes('Free to Keep'), summary.title);

    const detail = payload.messages[1].embeds[0].toJSON();
    assert.ok(detail.title.includes('Free to Keep'), detail.title);
    assert.ok(detail.description.includes('free to KEEP'));
  });

  await test('keeps the old wording when not flagged', () => {
    const snapshot = { freeToKeepGiveaways: [keepGame('1', 'Some Game')] };
    const payload = manager.buildCurrentAlert(snapshot);

    const summary = payload.messages[0].embeds[0].toJSON();
    assert.ok(summary.title.includes('Free Steam Game'), summary.title);
  });

  console.log('\npostFreeToKeepAlerts');

  await test('posts only newly seen free-to-keep games', async () => {
    const channel = makeChannel();
    const config = { channelId: '123', announcedKeepIds: [] };
    const snapshot = {
      freeToKeepGiveaways: [keepGame('10', 'New Free Game'), keepGame('11', 'Another Free Game')],
    };

    const firstRun = await manager.postFreeToKeepAlerts(config, channel, snapshot);
    assert.strictEqual(firstRun.length, 2);
    assert.strictEqual(channel.sent.length, 3, 'summary + one embed per game');
    assert.deepStrictEqual(config.announcedKeepIds, ['10', '11']);

    const secondRun = await manager.postFreeToKeepAlerts(config, channel, snapshot);
    assert.strictEqual(secondRun.length, 0, 'no duplicate posts');
    assert.strictEqual(channel.sent.length, 3);
  });

  await test('announces a game that newly becomes free', async () => {
    const channel = makeChannel();
    const config = { channelId: '123', announcedKeepIds: ['10'] };
    const snapshot = { freeToKeepGiveaways: [keepGame('10', 'Old'), keepGame('12', 'Fresh')] };

    const posted = await manager.postFreeToKeepAlerts(config, channel, snapshot);

    assert.strictEqual(posted.length, 1);
    assert.strictEqual(posted[0].title, 'Fresh');
    assert.deepStrictEqual(config.announcedKeepIds, ['10', '12']);
  });

  await test('does nothing when the free-to-keep list is empty', async () => {
    const channel = makeChannel();
    const config = { channelId: '123' };

    const posted = await manager.postFreeToKeepAlerts(config, channel, { freeToKeepGiveaways: [] });

    assert.strictEqual(posted.length, 0);
    assert.strictEqual(channel.sent.length, 0);
  });

  await test('stays silent when steamfreegames already posts to that channel', async () => {
    const channel = makeChannel();
    const config = { channelId: '555', announcedKeepIds: [] };
    const snapshot = { freeToKeepGiveaways: [keepGame('20', 'Owned Elsewhere')] };

    manager.data.guilds.dupGuild = { channelId: '555' };
    const posted = await manager.postFreeToKeepAlerts(config, channel, snapshot, {
      guildId: 'dupGuild',
    });

    assert.strictEqual(posted.length, 0, 'no duplicate post');
    assert.strictEqual(channel.sent.length, 0);
    assert.deepStrictEqual(config.announcedKeepIds, ['20'], 'still marked as seen');

    delete manager.data.guilds.dupGuild;
  });

  await test('posts when the channels differ', async () => {
    const channel = makeChannel();
    const config = { channelId: '777', announcedKeepIds: [] };
    const snapshot = { freeToKeepGiveaways: [keepGame('21', 'Fresh Game')] };

    manager.data.guilds.otherGuild = { channelId: '555' };
    const posted = await manager.postFreeToKeepAlerts(config, channel, snapshot, {
      guildId: 'otherGuild',
    });

    assert.strictEqual(posted.length, 1);
    assert.strictEqual(channel.sent.length, 2, 'summary + one game embed');

    delete manager.data.guilds.otherGuild;
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
