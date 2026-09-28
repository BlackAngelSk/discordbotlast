/**
 * Jest-native smoke suite.
 *
 * The project's own runner (node tests/run-all.js) executes tests/*.test.js and
 * cannot be driven by Jest, so this file gives Jest something real to own: it
 * statically verifies that every source file parses and that the command tables
 * are consistent. Nothing here executes application modules, so there are no
 * database connections or open handles.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'data',
  'logs',
  'backups',
  'assets',
  'coverage',
  '__pycache__',
  '.archive',
  '.continue',
]);

function walk(dir, filter) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (entry.name.startsWith('_')) continue; // _archive/ – holds disabled code
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p);

describe('source files parse', () => {
  const dirs = ['utils', 'commands', 'slashCommands', 'events', 'dashboard'];
  const files = dirs.flatMap((d) => {
    const dir = path.join(ROOT, d);
    return fs.existsSync(dir) ? walk(dir, (n) => n.endsWith('.js')) : [];
  });

  test('there is a substantial number of source files', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  test.each(files.map((f) => [rel(f), f]))('%s has valid syntax', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(() => new vm.Script(source, { filename: file })).not.toThrow();
  });
});

describe('message command exports', () => {
  const commandFiles = walk(path.join(ROOT, 'commands'), (n) => n.endsWith('.js'));

  test('every message command declares a name and an execute function', () => {
    const offenders = [];

    for (const file of commandFiles) {
      // Only inspect files that export a command object literal; thin re-export
      // shims (module.exports = require('...')) are covered by their target.
      const source = fs.readFileSync(file, 'utf8');
      if (/module\.exports\s*=\s*require\(/.test(source)) continue;

      const hasName = /(\bname\s*:|['"]name['"]\s*:)/.test(source);
      const hasExecute = /(async\s+)?execute\s*\(|execute\s*:/.test(source);
      if (!hasName || !hasExecute) offenders.push(rel(file));
    }

    expect(offenders).toEqual([]);
  });
});

describe('duplicate command names', () => {
  test('no two message-command files export the same command name', () => {
    const byName = new Map();

    for (const file of walk(path.join(ROOT, 'commands'), (n) => n.endsWith('.js'))) {
      const source = fs.readFileSync(file, 'utf8');
      if (/module\.exports\s*=\s*require\(/.test(source)) continue;

      const match = source.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
      if (!match) continue;

      const name = match[1];
      if (byName.has(name)) {
        byName.get(name).push(rel(file));
      } else {
        byName.set(name, [rel(file)]);
      }
    }

    const clashes = [...byName.entries()].filter(([, files]) => files.length > 1);
    expect(clashes).toEqual([]);
  });

  test('no two slash-command files export the same command name', () => {
    const byName = new Map();

    for (const file of walk(path.join(ROOT, 'slashCommands'), (n) => n.endsWith('.js'))) {
      const source = fs.readFileSync(file, 'utf8');
      const match = source.match(/\bsetName\(\s*['"]([^'"]+)['"]\s*\)/);
      if (!match) continue;

      const name = match[1].toLowerCase();
      if (byName.has(name)) {
        byName.get(name).push(rel(file));
      } else {
        byName.set(name, [rel(file)]);
      }
    }

    const clashes = [...byName.entries()].filter(([, files]) => files.length > 1);
    expect(clashes).toEqual([]);
  });
});

describe('project layout', () => {
  test('root data/ and logs/ dirs exist and are used instead of utils/ shadow dirs', () => {
    expect(fs.existsSync(path.join(ROOT, 'data'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'utils', 'data'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'utils', 'logs'))).toBe(false);
  });

  test('language files live at the project root', () => {
    const languages = path.join(ROOT, 'languages');
    expect(fs.existsSync(languages)).toBe(true);
    const json = fs.readdirSync(languages).filter((f) => f.endsWith('.json'));
    expect(json.length).toBeGreaterThan(0);
  });

  test('package.json declares the main test entrypoint', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('node tests/run-all.js');
  });
});
