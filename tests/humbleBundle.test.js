/**
 * Humble Bundle parsing: RSC payload decoding, bundlePage extraction, remaining
 * time formatting and ordering. No network calls.
 */

'use strict';

const assert = require('assert');
const hb = require('../utils/bundles/humbleBundle');

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

/** Build a page that mimics React's streamed RSC payload. */
function buildPage(chunks) {
  return chunks
    .map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`)
    .join('');
}

const bundlePage = {
  id: 'a8d0b76d-9453-443f-9360-db5d880887bf',
  slug: 'demo-bundle',
  title: 'Demo "Bundle" {with braces}',
  bundleType: 'games',
  headline: 'Homestead from your couch',
  endDate: '2026-11-27T05:00:00.000Z',
  startDate: '2026-11-05T21:00:00.000Z',
  keyExpirationDate: '2027-05-26T20:00:00.000Z',
  value: { amount: 178, currencyCode: 'USD' },
  tiers: [{ name: 'Tier 1', items: [{ title: 'Game A' }] }],
  logoImageUrl: 'https://hb.imgix.net/logo.png',
};

const bundleHtml = buildPage([
  'prefix text ',
  `"bundlePage":${JSON.stringify(bundlePage)}`,
  ',trailing text',
]);

// ============================================================
console.log('\n=== RSC payload ===');
// ============================================================

test('decodeNextPayload joins streamed chunks in order', () => {
  const html = buildPage(['alpha', 'beta', 'gamma']);
  assert.strictEqual(hb.decodeNextPayload(html), 'alphabetagamma');
});

test('decodeNextPayload survives malformed chunks', () => {
  const html = `<script>self.__next_f.push([1,"ok"])</script><script>self.__next_f.push(not-json)</script>`;
  assert.strictEqual(hb.decodeNextPayload(html), 'ok');
});

test('decodeNextPayload returns empty string for plain HTML', () => {
  assert.strictEqual(hb.decodeNextPayload('<html><body>nothing</body></html>'), '');
});

test('parseJsonObjectAt stops at the matching brace and ignores braces in strings', () => {
  const text = 'junk{"a":{"b":"}{\\""},"c":[1,2]}tail';
  const start = text.indexOf('{');
  const parsed = hb.parseJsonObjectAt(text, start);

  assert.deepStrictEqual(parsed, { a: { b: '}{"' }, c: [1, 2] });
});

test('parseJsonObjectAt returns null for truncated objects', () => {
  assert.strictEqual(hb.parseJsonObjectAt('{"a":1', 0), null);
  assert.strictEqual(hb.parseJsonObjectAt('not json', 0), null);
});

// ============================================================
console.log('\n=== Bundle page extraction ===');
// ============================================================

test('extractBundlePage returns the full bundle object', () => {
  const page = hb.extractBundlePage(bundleHtml);

  assert.ok(page, 'bundle page found');
  assert.strictEqual(page.slug, 'demo-bundle');
  assert.strictEqual(page.title, bundlePage.title);
  assert.strictEqual(page.endDate, bundlePage.endDate);
  assert.deepStrictEqual(page.value, { amount: 178, currencyCode: 'USD' });
  assert.deepStrictEqual(page.tiers, bundlePage.tiers);
});

test('extractBundlePage returns null when the marker is missing', () => {
  assert.strictEqual(hb.extractBundlePage(buildPage(['"somethingElse":{}'])), null);
});

// ============================================================
console.log('\n=== Listing slugs ===');
// ============================================================

test('extractBundleSlugs dedupes and keeps only the requested type', () => {
  const html = `
    <a href="/games/horror-trifectas">x</a>
    <a href="/games/horror-trifectas">duplicate</a>
    <a href="/books/some-book">y</a>
    <a href="/games/Resident-Evil-Biohazard">mixed case</a>
  `;

  assert.deepStrictEqual(hb.extractBundleSlugs(html, 'games'), [
    'horror-trifectas',
    'resident-evil-biohazard',
  ]);
  assert.deepStrictEqual(hb.extractBundleSlugs(html, 'books'), ['some-book']);
  assert.deepStrictEqual(hb.extractBundleSlugs(html, 'software'), []);
});

// ============================================================
console.log('\n=== Remaining time ===');
// ============================================================

test('formatRemaining renders days, hours and minutes', () => {
  const minute = 60 * 1000;
  const hour = 60 * minute;

  assert.strictEqual(hb.formatRemaining(9 * hour + 24 * minute), '9h 24m');
  assert.strictEqual(hb.formatRemaining(2 * 24 * hour + 9 * hour), '2d 9h');
  assert.strictEqual(hb.formatRemaining(45 * minute), '45m');
  assert.strictEqual(hb.formatRemaining(0), 'ended');
  assert.strictEqual(hb.formatRemaining(-1000), 'ended');
});

// ============================================================
console.log('\n=== Normalization and ordering ===');
// ============================================================

test('normalizeBundle maps dates, url and value', () => {
  const bundle = hb.normalizeBundle(bundlePage, 'games');

  assert.strictEqual(bundle.slug, 'demo-bundle');
  assert.strictEqual(bundle.url, 'https://www.humblebundle.com/games/demo-bundle');
  assert.strictEqual(bundle.endDate.toISOString(), '2026-11-27T05:00:00.000Z');
  assert.deepStrictEqual(bundle.value, { amount: 178, currency: 'USD' });
  assert.strictEqual(typeof bundle.remainingMs, 'number');
});

test('normalizeBundle marks ended bundles and tolerates bad dates', () => {
  const ended = hb.normalizeBundle({ slug: 'old', endDate: '2020-01-01T00:00:00.000Z' }, 'games');
  assert.strictEqual(ended.ended, true);
  assert.strictEqual(ended.remainingMs < 0, true);

  const broken = hb.normalizeBundle({ slug: 'broken', endDate: 'not-a-date' }, 'games');
  assert.strictEqual(broken.endDate, null);
  assert.strictEqual(broken.remainingMs, null);
  assert.strictEqual(broken.ended, false);
});

test('sortBundles puts the soonest-ending first and ended ones last', () => {
  const now = Date.now();
  const make = (slug, days, ended = false) => ({
    slug,
    ended,
    endDate: new Date(now + days * 86400000),
  });

  const sorted = hb.sortBundles([make('far', 10), make('gone', -1, true), make('soon', 1)]);

  assert.deepStrictEqual(
    sorted.map((bundle) => bundle.slug),
    ['soon', 'far', 'gone']
  );
});

// ============================================================
console.log('\n=== Command wiring ===');
// ============================================================

test('fitFields respects the field cap and the character budget', () => {
  const items = Array.from({ length: 40 }, (_, index) => ({ id: index }));
  const format = (item) => ({ name: `Bundle ${item.id}`, value: 'x'.repeat(100) });

  const capped = hb.fitFields(items, { maxFields: 25, charBudget: 100000, format });
  assert.strictEqual(capped.fields.length, 25);
  assert.strictEqual(capped.remaining, 15);

  const budgeted = hb.fitFields(items, { maxFields: 25, charBudget: 500, format });
  assert.ok(budgeted.fields.length < 25, 'budget cuts the list short');
  const used = budgeted.fields.reduce(
    (total, field) => total + field.name.length + field.value.length,
    0
  );
  assert.ok(used <= 500, `used ${used} chars`);
  assert.strictEqual(budgeted.remaining, 40 - budgeted.fields.length);
});

test('command exposes name, aliases and usage', () => {
  const command = require('../commands/utility/humblebundle');

  assert.strictEqual(command.name, 'humblebundle');
  assert.ok(command.aliases.includes('humble'));
  assert.ok(command.usage.includes('!humblebundle'));
  assert.strictEqual(typeof command.execute, 'function');
});

test('command rejects an unknown bundle type without fetching', async () => {
  const command = require('../commands/utility/humblebundle');
  let replyText = null;

  await command.execute({ reply: async (payload) => (replyText = payload) }, ['nonsense']);

  assert.ok(replyText.includes('Unknown bundle type'), replyText);
});

queue.then(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}`);
  if (failed > 0) process.exit(1);
});
