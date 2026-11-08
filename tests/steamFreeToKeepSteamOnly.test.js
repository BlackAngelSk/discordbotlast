/**
 * Free-to-keep alerts are Steam-only: third-party giveaway sites must be ignored
 * and every candidate has to be confirmed by Steam's own price API.
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

function steamGiveaway(appId = '252490', title = 'Rust') {
  return {
    id: `gp_${appId}`,
    title,
    url: `https://store.steampowered.com/app/${appId}/`,
    description: 'Free to keep',
    worth: '$39.99',
    endDate: null,
  };
}

function verifiedSteamApp(appId = '252490', title = 'Rust') {
  return {
    id: `steam_keep_${appId}`,
    title,
    description: 'Survival game',
    worth: '$39.99',
    url: `https://store.steampowered.com/app/${appId}/`,
    imageUrl: 'https://cdn.example/header.jpg',
    instructions: 'Add to library',
    publishedDate: null,
    endDate: '2026-11-20T18:00:00.000Z',
    type: 'Game',
    platforms: 'Steam',
  };
}

(async () => {
  console.log('\nisSteamStoreUrl');

  await test('accepts Steam store links', () => {
    assert.strictEqual(manager.isSteamStoreUrl('https://store.steampowered.com/app/252490/'), true);
    assert.strictEqual(
      manager.isSteamStoreUrl('https://store.steampowered.com/app/252490/Rust/?snr=1'),
      true
    );
    assert.strictEqual(manager.isSteamStoreUrl('https://steampowered.com/app/1/'), true);
  });

  await test('rejects every third-party giveaway site', () => {
    const thirdParty = [
      'https://www.gamerpower.com/open/dwarven-realms-steam-key-giveaway',
      'https://na.alienwarearena.com/ucf/show/1',
      'https://www.humblebundle.com/store/free-game',
      'https://www.fanatical.com/en/game/x',
      'https://store.epicgames.com/en-US/free-games',
      'https://steamdb.info/app/252490/',
      'https://fake-steampowered.com/app/1/',
      'https://store.steampowered.com.evil.example/app/1/',
    ];

    for (const url of thirdParty) {
      assert.strictEqual(manager.isSteamStoreUrl(url), false, `should reject ${url}`);
    }
  });

  await test('rejects garbage', () => {
    assert.strictEqual(manager.isSteamStoreUrl(null), false);
    assert.strictEqual(manager.isSteamStoreUrl(''), false);
    assert.strictEqual(manager.isSteamStoreUrl('not a url'), false);
  });

  console.log('\nconfirmSteamFreeToKeep');

  await test('drops third-party giveaways without calling Steam', async () => {
    let called = 0;

    const result = await manager.confirmSteamFreeToKeep(
      { ...steamGiveaway(), url: 'https://www.gamerpower.com/open/some-key-giveaway' },
      {
        verifyApp: async () => {
          called += 1;
          return verifiedSteamApp();
        },
      }
    );

    assert.strictEqual(result, null);
    assert.strictEqual(called, 0, 'no Steam API call for non-Steam links');
  });

  await test('drops Steam links Steam does not confirm as 100% off', async () => {
    const result = await manager.confirmSteamFreeToKeep(steamGiveaway('999'), {
      verifyApp: async () => null,
    });

    assert.strictEqual(result, null);
  });

  await test('keeps Steam-confirmed free-to-keep games', async () => {
    const result = await manager.confirmSteamFreeToKeep(steamGiveaway('252490'), {
      verifyApp: async (appId) => verifiedSteamApp(appId),
    });

    assert.ok(result, 'confirmed deal returned');
    assert.strictEqual(result.url, 'https://store.steampowered.com/app/252490/');
    assert.strictEqual(result.title, 'Rust');
    assert.strictEqual(result.endDate, '2026-11-20T18:00:00.000Z');
  });

  await test('prefers the real Steam title over a generic placeholder', async () => {
    const result = await manager.confirmSteamFreeToKeep(steamGiveaway('123', 'Free Steam Keys'), {
      verifyApp: async (appId) => verifiedSteamApp(appId, 'Steam App 123'),
    });

    assert.strictEqual(result.title, 'Free Steam Keys');
  });

  await test('survives a verifier that throws', async () => {
    const result = await manager.confirmSteamFreeToKeep(steamGiveaway(), {
      verifyApp: async () => {
        throw new Error('HTTP 403');
      },
    });

    assert.strictEqual(result, null);
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
