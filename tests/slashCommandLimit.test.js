/**
 * Discord caps global chat-input commands at 100 per application. Registration
 * must never exceed it (API error 30032) and must be deterministic.
 */
'use strict';

const assert = require('assert');

const Handler = require('../utils/core/slashCommandHandler');

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

function fakeCommand(name, category) {
  return { data: { name }, __slashCategory: category };
}

function commandCollection(list) {
  const map = new Map(list.map((command) => [command.data.name, command]));
  return {
    values: () => map.values(),
    get size() {
      return map.size;
    },
  };
}

(async () => {
  console.log('\nresolveCommandLimit');

  await test('defaults to 100', () => {
    delete process.env.MAX_GLOBAL_SLASH_COMMANDS;
    assert.strictEqual(Handler.resolveCommandLimit(), 100);
  });

  await test('never exceeds the Discord limit', () => {
    process.env.MAX_GLOBAL_SLASH_COMMANDS = '250';
    assert.strictEqual(Handler.resolveCommandLimit(), 100);

    process.env.MAX_GLOBAL_SLASH_COMMANDS = '60';
    assert.strictEqual(Handler.resolveCommandLimit(), 60);

    process.env.MAX_GLOBAL_SLASH_COMMANDS = '0';
    assert.strictEqual(Handler.resolveCommandLimit(), 100);

    delete process.env.MAX_GLOBAL_SLASH_COMMANDS;
  });

  console.log('\nselectCommandsForRegistration');

  await test('caps the payload at the limit', () => {
    const commands = commandCollection(
      Array.from({ length: 140 }, (_, i) =>
        fakeCommand(`cmd${String(i).padStart(3, '0')}`, 'utility')
      )
    );

    const { selected, skipped } = Handler.selectCommandsForRegistration(commands, 100);

    assert.strictEqual(selected.length, 100);
    assert.strictEqual(skipped.length, 40);
  });

  await test('drops games first when over the limit', () => {
    const commands = commandCollection([
      fakeCommand('play', 'music'),
      fakeCommand('slots', 'fun'),
      fakeCommand('ban', 'moderation'),
      fakeCommand('help', 'utility'),
      fakeCommand('daily', 'economy'),
    ]);

    const { selected, skipped } = Handler.selectCommandsForRegistration(commands, 4);

    assert.deepStrictEqual(
      selected.map((command) => command.data.name),
      ['ban', 'help', 'play', 'daily']
    );
    assert.deepStrictEqual(
      skipped.map((command) => command.data.name),
      ['slots']
    );
  });

  await test('is deterministic (alphabetical within a category)', () => {
    const commands = commandCollection([
      fakeCommand('zeta', 'utility'),
      fakeCommand('alpha', 'utility'),
      fakeCommand('beta', 'utility'),
    ]);

    const first = Handler.selectCommandsForRegistration(commands, 2);
    const second = Handler.selectCommandsForRegistration(commands, 2);

    assert.deepStrictEqual(
      first.selected.map((command) => command.data.name),
      ['alpha', 'beta']
    );
    assert.deepStrictEqual(
      first.selected.map((command) => command.data.name),
      second.selected.map((command) => command.data.name)
    );
  });

  console.log('\nreal command set');

  await test('the repo stays within the limit and /auditlog absorbed /auditlogs', async () => {
    const handler = new Handler({});

    const originalLog = console.log;
    console.log = () => {};
    try {
      await handler.loadSlashCommands();
    } finally {
      console.log = originalLog;
    }

    assert.ok(
      handler.commands.size <= Handler.GLOBAL_SLASH_COMMAND_LIMIT,
      `loaded ${handler.commands.size} commands (limit ${Handler.GLOBAL_SLASH_COMMAND_LIMIT})`
    );

    const { selected, skipped } = Handler.selectCommandsForRegistration(handler.commands);
    assert.strictEqual(selected.length, handler.commands.size);
    assert.strictEqual(skipped.length, 0);

    const auditlog = handler.commands.get('auditlog');
    assert.ok(auditlog, '/auditlog exists');
    assert.deepStrictEqual(
      auditlog.data.options.map((option) => option.name),
      ['view', 'export', 'recent', 'user', 'stats']
    );
    assert.strictEqual(handler.commands.has('auditlogs'), false, '/auditlogs merged away');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
