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

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (error) {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${error.message}`);
    }
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
    const hasVersionField = data.fields && data.fields.some(f => f.name === 'Version');
    assert.ok(hasVersionField, 'Sample embed should have a Version field');
});

test('Sample alert embed has section-based description', async () => {
    const alerts = await manager.buildTestAlerts('test-guild-no-config');
    const embed = alerts[0].embeds[0];
    const data = embed.toJSON ? embed.toJSON() : embed;
    
    // Should contain the [ NEW FEATURES ] and [ BUG FIXES ] section markers
    assert.ok(data.description.includes('NEW FEATURES') || data.description.includes('New Features'), 
        'Description should contain New Features section');
    assert.ok(data.description.includes('BUG FIXES') || data.description.includes('Bug Fixes'), 
        'Description should contain Bug Fixes section');
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
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'steamGameUpdatesManager.js'), 'utf8');
    
    assert.ok(source.includes('SPECIAL_TRACKED_SOURCES'), 'Source should define SPECIAL_TRACKED_SOURCES');
    
    // Verify all new game sources are present
    const newGames = ['overwatch', 'apex', 'cs2', 'dota2', 'valheim', 'rust', 'pubg', 'nvidia', 'amd', 'intel'];
    for (const game of newGames) {
        // Keys can be quoted or unquoted in the object literal
        assert.ok(source.includes(`'${game}'`) || source.includes(`${game}:`), `Source should have entry for ${game}`);
    }
});

test('Module source has MAX_TRACKED_GAMES = 25', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'steamGameUpdatesManager.js'), 'utf8');
    assert.ok(source.includes('MAX_TRACKED_GAMES = 25'), 'MAX_TRACKED_GAMES should be 25');
});

test('Module source uses SPECIAL_PROVIDER_FETCHERS lookup table', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'steamGameUpdatesManager.js'), 'utf8');
    
    assert.ok(source.includes('SPECIAL_PROVIDER_FETCHERS'), 'Should define SPECIAL_PROVIDER_FETCHERS');
    
    // Verify all providers are in the lookup table
    const providers = ['minecraft', 'league', 'osu', 'valorant', 'ffxiv', 'wow', 'poe', 'fortnite', 'helldivers2', 'diablo', 'overwatch', 'apex', 'nvidia', 'amd', 'intel'];
    for (const p of providers) {
        assert.ok(source.includes(`    ${p}: fetch`), `SPECIAL_PROVIDER_FETCHERS should include ${p}`);
    }
});

test('Module source has createGenericWebFetcher factory', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'steamGameUpdatesManager.js'), 'utf8');
    assert.ok(source.includes('function createGenericWebFetcher'), 'Should define createGenericWebFetcher');
    assert.ok(source.includes('function decodeEntities'), 'Should define decodeEntities');
});

test('Module source embed builder uses fields for version and date', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'steamGameUpdatesManager.js'), 'utf8');
    
    // Check that createUpdateEmbed adds fields
    assert.ok(source.includes("'Version'"), 'Embed should add Version field');
    assert.ok(source.includes("'Released'"), 'Embed should add Released field');
    assert.ok(source.includes("'Store'"), 'Embed should add Store field');
    assert.ok(source.includes("setAuthor"), 'Embed should use setAuthor for game name');
    assert.ok(source.includes("setThumbnail"), 'Embed should use setThumbnail');
    assert.ok(source.includes("setImage"), 'Embed should use setImage for banner');
});

// ============================================================
console.log('\n=== Command Description ===');
// ============================================================

test('steamupdates command description includes all new games', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'admin', 'steamupdates.js'), 'utf8');
    
    const games = ['Overwatch 2', 'Apex Legends', 'CS2', 'Dota 2', 'Valheim', 'Rust', 'PUBG'];
    for (const game of games) {
        assert.ok(source.includes(game), `Command description should mention ${game}`);
    }
});

test('steamupdates command usage includes new game names', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'admin', 'steamupdates.js'), 'utf8');
    
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
    const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'), 'utf8');
    
    assert.ok(source.includes('specialSourceDefaults'), 'Should define specialSourceDefaults');
    
    const sources = ['minecraft', 'osu', 'league', 'valorant', 'ffxiv', 'wow', 'poe', 'fortnite', 'helldivers2', 'diablo', 'overwatch', 'apex', 'cs2', 'dota2', 'valheim', 'rust', 'pubg'];
    for (const s of sources) {
        assert.ok(source.includes(`${s}:`), `Dashboard should have quick-add entry for ${s}`);
    }
});

test('Dashboard EJS escapeHtml uses split/join pattern', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'), 'utf8');
    
    // The fix was to use split().join() instead of replaceAll() which isn't available in all envs
    assert.ok(source.includes('.split(AMP).join('), 'escapeHtml should use split/join pattern for ampersand');
    assert.ok(source.includes('.split(LT).join('), 'escapeHtml should use split/join pattern for less-than');
});

test('Dashboard EJS textarea placeholder includes all game names', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'), 'utf8');
    
    const names = ['minecraft', 'osu', 'lol', 'valorant', 'ffxiv', 'wow', 'poe', 'fortnite', 'helldivers2', 'diablo', 'overwatch', 'apex', 'cs2', 'dota2', 'valheim', 'rust', 'pubg'];
    for (const name of names) {
        assert.ok(source.includes(name), `Placeholder should include ${name}`);
    }
});

test('Dashboard supports up to 25 sources', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'views', 'steam-updates.ejs'), 'utf8');
    assert.ok(source.includes('selectedGames.size >= 25') || source.includes('max.*25') || source.includes("'25'"), 
        'Dashboard should enforce 25 game limit');
});

// ============================================================
// Results
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
    process.exit(1);
}