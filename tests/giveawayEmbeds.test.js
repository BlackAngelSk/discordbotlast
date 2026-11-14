/**
 * Tests for the shared giveaway embeds (utils/giveawayEmbeds.js).
 * Plain-node harness, matching the rest of tests/*.test.js.
 */

const assert = require('assert');
const {
  COLORS,
  buildGiveawayEmbed,
  buildGiveawayEndedEmbed,
  buildGiveawayEmptyEmbed,
} = require('../utils/giveawayEmbeds');

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

const HOST = '111111111111111111';
const END = Math.floor(Date.now() / 1000) * 1000 + 2 * 60 * 60 * 1000;

console.log('\n=== Active Giveaway Embed ===');

test('active embed carries the prize, host and timer', () => {
  const json = buildGiveawayEmbed({
    prize: 'Discord Nitro',
    winners: 2,
    hostId: HOST,
    endTime: END,
  }).toJSON();

  assert.strictEqual(json.color, COLORS.active);
  assert.strictEqual(json.author.name, 'GIVEAWAY');
  assert.ok(json.title.includes('Discord Nitro'), 'title should show the prize');
  assert.ok(json.description.includes('React with 🎉'), 'description should explain how to enter');
  assert.strictEqual(json.fields.length, 3);

  const [winners, host, ends] = json.fields;
  assert.strictEqual(winners.name, '🏆 Winners');
  assert.strictEqual(winners.value, '**2**');
  assert.strictEqual(host.value, `<@${HOST}>`);
  assert.ok(ends.value.includes('<t:'), 'ends field should be a Discord timestamp');
  assert.strictEqual(json.footer.text.length > 0, true);
  assert.strictEqual(new Date(json.timestamp).getTime(), END);
});

test('active embed uses the guild icon when given', () => {
  const json = buildGiveawayEmbed({
    prize: 'Steam key',
    winners: 1,
    hostId: HOST,
    endTime: END,
    guildIconUrl: 'https://cdn.discordapp.com/icons/1/abc.png',
  }).toJSON();

  assert.strictEqual(json.author.icon_url, 'https://cdn.discordapp.com/icons/1/abc.png');
});

test('active embed has no icon when the guild has none', () => {
  const json = buildGiveawayEmbed({ prize: 'x', winners: 1, hostId: HOST, endTime: END }).toJSON();
  assert.strictEqual(json.author.icon_url, undefined);
});

test('long prizes are truncated to the embed title limit', () => {
  const json = buildGiveawayEmbed({
    prize: 'A'.repeat(400),
    winners: 1,
    hostId: HOST,
    endTime: END,
  }).toJSON();

  assert.ok(json.title.length <= 256, `title was ${json.title.length} chars`);
  assert.ok(json.title.endsWith('...'));
});

test('winner count is clamped to at least one', () => {
  const json = buildGiveawayEmbed({ prize: 'x', winners: 0, hostId: HOST, endTime: END }).toJSON();
  assert.strictEqual(json.fields[0].value, '**1**');
});

console.log('\n=== Ended Giveaway Embeds ===');

test('ended embed announces winners, entries and host', () => {
  const winners = ['<@222222222222222222>', '<@333333333333333333>'];
  const json = buildGiveawayEndedEmbed({
    prize: 'Discord Nitro',
    winners,
    entries: 147,
    hostId: HOST,
  }).toJSON();

  assert.strictEqual(json.color, COLORS.won);
  assert.strictEqual(json.author.name, 'GIVEAWAY ENDED');
  assert.ok(json.title.includes('Discord Nitro'));
  assert.ok(json.description.includes(winners[0]));
  assert.ok(json.description.includes(winners[1]));
  assert.ok(/congratulations/i.test(json.description));

  const values = json.fields.map((f) => f.value);
  assert.ok(values.includes('**147**'), 'entries field should show the entry count');
  assert.ok(values.includes(`<@${HOST}>`), 'host field should mention the host');
  assert.strictEqual(json.footer.text, 'Thanks for joining!');
});

test('ended embed caps the winner list and counts the rest', () => {
  const winners = Array.from({ length: 14 }, (_, index) => `<@${900000000000000000 + index}>`);
  const json = buildGiveawayEndedEmbed({ prize: 'x', winners, entries: 300 }).toJSON();

  assert.ok(json.description.includes('and **4** more'), 'should mention the hidden winners');
  assert.strictEqual((json.description.match(/<@\d+>/g) || []).length, 10);
});

test('ended embed tolerates a missing host', () => {
  const json = buildGiveawayEndedEmbed({ prize: 'x', winners: ['<@1>'], entries: 1 }).toJSON();
  const hostField = json.fields.find((f) => f.name === '👑 Hosted by');
  assert.strictEqual(hostField.value, '—');
});

test('empty embed reports zero entries and no winners', () => {
  const json = buildGiveawayEmptyEmbed({ prize: 'Hollow Knight', hostId: HOST }).toJSON();

  assert.strictEqual(json.color, COLORS.empty);
  assert.strictEqual(json.author.name, 'GIVEAWAY ENDED');
  assert.ok(/no valid entries/i.test(json.description));
  const entriesField = json.fields.find((f) => f.name === '🎟️ Entries');
  assert.strictEqual(entriesField.value, '**0**');
  assert.ok(json.fields.some((f) => f.name === '👑 Hosted by'));
  assert.ok(json.footer.text.length > 0);
});

test('embed payloads stay inside Discord field limits', () => {
  const payloads = [
    buildGiveawayEmbed({ prize: 'x'.repeat(200), winners: 5, hostId: HOST, endTime: END }),
    buildGiveawayEndedEmbed({
      prize: 'x'.repeat(200),
      winners: ['<@1>'],
      entries: 9,
      hostId: HOST,
    }),
    buildGiveawayEmptyEmbed({ prize: 'x'.repeat(200), hostId: HOST }),
  ].map((embed) => embed.toJSON());

  for (const json of payloads) {
    assert.ok(json.title.length <= 256);
    assert.ok((json.description || '').length <= 4096);
    for (const field of json.fields) {
      assert.ok(field.name.length <= 256, `field name too long: ${field.name.length}`);
      assert.ok(field.value.length <= 1024, `field value too long: ${field.value.length}`);
    }
    assert.ok(json.footer.text.length <= 2048);
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
