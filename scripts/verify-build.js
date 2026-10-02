#!/usr/bin/env node
/**
 * Build verification for a plain-Node project with no bundler.
 *
 * There is nothing to compile here, so "build" means: prove the source tree is
 * a valid, self-consistent artifact before it is deployed. This catches the
 * exact class of breakage that static lint cannot see — a file that does not
 * parse, an import pointing at a file that was moved or deleted, and an
 * entrypoint that no longer resolves.
 *
 * Exits 0 when the tree is sound, 1 otherwise (with a readable list of what is
 * wrong), so it is safe to gate a CI job on it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Source trees that make up the shipped bot.
const SOURCE_DIRS = ['utils', 'commands', 'slashCommands', 'events', 'dashboard', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'data',
  'logs',
  'backups',
  'coverage',
  '__pycache__',
  '.archive',
  'tests',
]);

const failures = [];
let checkedFiles = 0;
let checkedRequires = 0;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `_`-prefixed dirs hold disabled/archived code and are not shipped.
      if (entry.name.startsWith('_')) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

// ── 1. Entry point resolves ─────────────────────────────────────────────────
const pkgPath = path.join(ROOT, 'package.json');
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (error) {
  failures.push(`package.json is not valid JSON: ${error.message}`);
}

const entry = pkg && pkg.main ? path.join(ROOT, pkg.main) : null;
if (!entry || !fs.existsSync(entry)) {
  failures.push(`package.json "main" does not resolve: ${pkg ? pkg.main : '(unset)'}`);
}

// ── 2. Every source file parses ─────────────────────────────────────────────
const files = [
  entry,
  ...SOURCE_DIRS.flatMap((d) => {
    const dir = path.join(ROOT, d);
    return fs.existsSync(dir) ? walk(dir) : [];
  }),
].filter(Boolean);

for (const file of files) {
  checkedFiles++;
  const source = fs.readFileSync(file, 'utf8');

  if (file.endsWith('.mjs')) {
    // ESM syntax cannot be parsed by vm.Script; `node --check` parses without
    // executing the module.
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (check.status !== 0) {
      failures.push(`${path.relative(ROOT, file)}: ${(check.stderr || '').trim().split('\n').pop()}`);
    }
    continue;
  }

  try {
    // Parse only — never execute, so no DB connections or timers are started.
    new vm.Script(source, { filename: file });
  } catch (error) {
    failures.push(`${path.relative(ROOT, file)}: ${error.message}`);
  }
}

// ── 3. Every relative require/import resolves ───────────────────────────────
const REQUIRE_RE = /(?:require\(\s*['"]|import\s*['"]|import\s+[^'"]*?\s+from\s*['"])(\.[^'"]+)['"]/g;
const RESOLVE_EXTS = ['.js', '.json', '.mjs', '.node'];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let match;

  while ((match = REQUIRE_RE.exec(source)) !== null) {
    checkedRequires++;
    const spec = match[1];
    const base = path.resolve(dir, spec);
    const candidates = [
      base,
      ...RESOLVE_EXTS.map((ext) => `${base}${ext}`),
      path.join(base, 'index.js'),
    ];

    if (!candidates.some((c) => fs.existsSync(c))) {
      failures.push(`${path.relative(ROOT, file)}: cannot resolve require('${spec}')`);
    }
  }
}

// ── 4. Every message command is loadable ────────────────────────────────────
const commandsDir = path.join(ROOT, 'commands');
if (fs.existsSync(commandsDir)) {
  for (const file of walk(commandsDir)) {
    const source = fs.readFileSync(file, 'utf8');
    // Thin re-export shims are validated through their target instead.
    if (/module\.exports\s*=\s*require\(/.test(source)) continue;

    if (!/(\bname\s*:|['"]name['"]\s*:)/.test(source)) {
      failures.push(`${path.relative(ROOT, file)}: command has no "name"`);
    }
    if (!/(async\s+)?execute\s*\(|execute\s*:/.test(source)) {
      failures.push(`${path.relative(ROOT, file)}: command has no "execute"`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`build: checked ${checkedFiles} files, ${checkedRequires} relative imports`);

if (failures.length > 0) {
  console.error(`\nbuild FAILED with ${failures.length} problem(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('build OK');
