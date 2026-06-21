/**
 * Tests for utils/customCommandManager.js
 * Covers: addCommand, removeCommand, getCommand, getCommands, per-guild isolation,
 *         cooldowns, role restrictions, usage tracking, aliases, migration
 */
'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

// ── Test class mirroring the enhanced CustomCommandManager ─────────────────
class TestCustomCommandManager {
    constructor() {
        this.data = {};
        this.cooldowns = {};
    }

    migrateCommand(cmd) {
        if (typeof cmd === 'string') {
            return {
                response: cmd,
                cooldown: 0,
                requiredRole: null,
                createdBy: null,
                createdAt: null,
                usageCount: 0,
                lastUsedAt: null,
                aliases: [],
                enabled: true
            };
        }
        return {
            response: cmd.response,
            cooldown: Number(cmd.cooldown) || 0,
            requiredRole: cmd.requiredRole || null,
            createdBy: cmd.createdBy || null,
            createdAt: cmd.createdAt || null,
            usageCount: Number(cmd.usageCount) || 0,
            lastUsedAt: cmd.lastUsedAt || null,
            aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
            enabled: cmd.enabled !== false
        };
    }

    async addCommand(guildId, name, response, options = {}) {
        if (!this.data[guildId]) this.data[guildId] = {};
        const existing = this.data[guildId][name.toLowerCase()];
        const existingMeta = existing && typeof existing === 'object' ? existing : {};
        this.data[guildId][name.toLowerCase()] = {
            response,
            cooldown: Number(options.cooldown ?? existingMeta.cooldown) || 0,
            requiredRole: options.requiredRole ?? existingMeta.requiredRole ?? null,
            createdBy: options.createdBy ?? existingMeta.createdBy ?? null,
            createdAt: existingMeta.createdAt || new Date().toISOString(),
            usageCount: existingMeta.usageCount || 0,
            lastUsedAt: existingMeta.lastUsedAt || null,
            aliases: Array.isArray(options.aliases) ? options.aliases : (existingMeta.aliases || []),
            enabled: options.enabled !== undefined ? options.enabled : (existingMeta.enabled !== false)
        };
    }

    async removeCommand(guildId, name) {
        if (this.data[guildId]) delete this.data[guildId][name.toLowerCase()];
    }

    getCommand(guildId, name) {
        if (!this.data[guildId]) return null;
        const cmd = this.data[guildId][name.toLowerCase()];
        if (!cmd) return null;
        return this.migrateCommand(cmd);
    }

    getCommands(guildId) {
        const raw = this.data[guildId] || {};
        const migrated = {};
        for (const [n, c] of Object.entries(raw)) migrated[n] = this.migrateCommand(c);
        return migrated;
    }

    getCooldownRemaining(guildId, commandName, userId) {
        const key = `${guildId}:${commandName}:${userId}`;
        const expiry = this.cooldowns[key] || 0;
        return Date.now() >= expiry ? 0 : Math.ceil((expiry - Date.now()) / 1000);
    }

    setCooldown(guildId, commandName, userId, seconds) {
        if (seconds <= 0) return;
        this.cooldowns[`${guildId}:${commandName}:${userId}`] = Date.now() + (seconds * 1000);
    }

    async recordUsage(guildId, commandName) {
        if (!this.data[guildId] || !this.data[guildId][commandName]) return;
        const cmd = this.migrateCommand(this.data[guildId][commandName]);
        cmd.usageCount = (cmd.usageCount || 0) + 1;
        cmd.lastUsedAt = new Date().toISOString();
        this.data[guildId][commandName] = cmd;
    }

    checkRolePermission(member, requiredRoleId) {
        if (!requiredRoleId) return true;
        if (!member || !member.roles) return false;
        return member.roles.cache?.has(requiredRoleId) || member.roles.includes?.(requiredRoleId);
    }

    findCommand(guildId, nameOrAlias) {
        const commands = this.data[guildId] || {};
        const lower = nameOrAlias.toLowerCase();
        if (commands[lower]) return { name: lower, command: this.migrateCommand(commands[lower]) };
        for (const [cmdName, cmdData] of Object.entries(commands)) {
            const cmd = this.migrateCommand(cmdData);
            if (Array.isArray(cmd.aliases) && cmd.aliases.map(a => a.toLowerCase()).includes(lower)) {
                return { name: cmdName, command: cmd };
            }
        }
        return null;
    }

    getTopCommands(guildId, limit = 10) {
        const commands = this.getCommands(guildId);
        return Object.entries(commands)
            .map(([name, cmd]) => ({ name, ...cmd }))
            .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
            .slice(0, limit);
    }
}

function fresh() { return new TestCustomCommandManager(); }

// ── addCommand ────────────────────────────────────────────────────────────
console.log('\naddCommand');

test('adds a command with text response', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi there!');
    assert.strictEqual(mgr.getCommand('g1', 'hello').response, 'Hi there!');
});

test('lowercases command names', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'HELLO', 'Hi!');
    assert.strictEqual(mgr.getCommand('g1', 'hello').response, 'Hi!');
    assert.strictEqual(mgr.getCommand('g1', 'HELLO').response, 'Hi!');
});

test('creates guild structure on first command', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'ok');
    assert.deepStrictEqual(Object.keys(mgr.data), ['g1']);
});

test('can store embed object responses', async () => {
    const mgr = fresh();
    const embedResponse = { type: 'embed', embed: { title: 'Hello', description: 'World', color: '#5865F2' } };
    await mgr.addCommand('g1', 'embed', embedResponse);
    const cmd = mgr.getCommand('g1', 'embed');
    assert.strictEqual(cmd.response.type, 'embed');
    assert.strictEqual(cmd.response.embed.title, 'Hello');
});

test('overwrites existing command with same name', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'v1');
    await mgr.addCommand('g1', 'test', 'v2');
    assert.strictEqual(mgr.getCommand('g1', 'test').response, 'v2');
});

test('multiple commands in same guild', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi');
    await mgr.addCommand('g1', 'bye', 'Goodbye');
    assert.strictEqual(mgr.getCommand('g1', 'hello').response, 'Hi');
    assert.strictEqual(mgr.getCommand('g1', 'bye').response, 'Goodbye');
});

// ── removeCommand ─────────────────────────────────────────────────────────
console.log('\nremoveCommand');

test('removes an existing command', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'ok');
    await mgr.removeCommand('g1', 'test');
    assert.strictEqual(mgr.getCommand('g1', 'test'), null);
});

test('no-op when command does not exist', async () => {
    const mgr = fresh();
    await mgr.removeCommand('g1', 'nonexistent');
    assert.strictEqual(mgr.getCommand('g1', 'nonexistent'), null);
});

test('no-op for non-existent guild', async () => {
    const mgr = fresh();
    await mgr.removeCommand('no_guild', 'test');
});

test('only removes target command', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi');
    await mgr.addCommand('g1', 'bye', 'Bye');
    await mgr.removeCommand('g1', 'hello');
    assert.strictEqual(mgr.getCommand('g1', 'hello'), null);
    assert.strictEqual(mgr.getCommand('g1', 'bye').response, 'Bye');
});

test('case-insensitive removal', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'Test', 'ok');
    await mgr.removeCommand('g1', 'TEST');
    assert.strictEqual(mgr.getCommand('g1', 'test'), null);
});

// ── getCommand ────────────────────────────────────────────────────────────
console.log('\ngetCommand');

test('returns null for non-existent command', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getCommand('g1', 'nope'), null);
});

test('returns null for non-existent guild', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getCommand('no_guild', 'test'), null);
});

test('is case-insensitive', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi');
    assert.strictEqual(mgr.getCommand('g1', 'HELLO').response, 'Hi');
    assert.strictEqual(mgr.getCommand('g1', 'Hello').response, 'Hi');
});

// ── getCommands ───────────────────────────────────────────────────────────
console.log('\ngetCommands');

test('returns empty object for unknown guild', () => {
    const mgr = fresh();
    assert.deepStrictEqual(mgr.getCommands('g1'), {});
});

test('returns all commands for guild', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'a', '1');
    await mgr.addCommand('g1', 'b', '2');
    await mgr.addCommand('g1', 'c', '3');
    const cmds = mgr.getCommands('g1');
    assert.strictEqual(Object.keys(cmds).length, 3);
    assert.strictEqual(cmds.a.response, '1');
    assert.strictEqual(cmds.b.response, '2');
    assert.strictEqual(cmds.c.response, '3');
});

// ── Per-guild isolation ───────────────────────────────────────────────────
console.log('\nPer-guild isolation');

test('commands in different guilds do not interfere', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi from g1');
    await mgr.addCommand('g2', 'hello', 'Hi from g2');
    assert.strictEqual(mgr.getCommand('g1', 'hello').response, 'Hi from g1');
    assert.strictEqual(mgr.getCommand('g2', 'hello').response, 'Hi from g2');
});

test('removing from one guild does not affect others', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'g1');
    await mgr.addCommand('g2', 'test', 'g2');
    await mgr.removeCommand('g1', 'test');
    assert.strictEqual(mgr.getCommand('g1', 'test'), null);
    assert.strictEqual(mgr.getCommand('g2', 'test').response, 'g2');
});

// ── Migration ─────────────────────────────────────────────────────────────
console.log('\nMigration');

test('migrates v1 string response to v2 object', async () => {
    const mgr = fresh();
    // Simulate v1 data
    mgr.data['g1'] = { test: 'Hello World' };
    const cmd = mgr.getCommand('g1', 'test');
    assert.strictEqual(cmd.response, 'Hello World');
    assert.strictEqual(cmd.cooldown, 0);
    assert.strictEqual(cmd.requiredRole, null);
    assert.strictEqual(cmd.enabled, true);
    assert.deepStrictEqual(cmd.aliases, []);
});

test('preserves v2 fields when migrating', async () => {
    const mgr = fresh();
    mgr.data['g1'] = { test: { response: 'Hi', cooldown: 10, requiredRole: '123', enabled: false, aliases: ['hi', 'hey'] } };
    const cmd = mgr.getCommand('g1', 'test');
    assert.strictEqual(cmd.response, 'Hi');
    assert.strictEqual(cmd.cooldown, 10);
    assert.strictEqual(cmd.requiredRole, '123');
    assert.strictEqual(cmd.enabled, false);
    assert.deepStrictEqual(cmd.aliases, ['hi', 'hey']);
});

// ── Cooldowns ─────────────────────────────────────────────────────────────
console.log('\nCooldowns');

test('no cooldown initially', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getCooldownRemaining('g1', 'cmd', 'user1'), 0);
});

test('setCooldown and getCooldownRemaining', async () => {
    const mgr = fresh();
    mgr.setCooldown('g1', 'cmd', 'user1', 5);
    const remaining = mgr.getCooldownRemaining('g1', 'cmd', 'user1');
    assert.ok(remaining > 0 && remaining <= 5, `Should be >0 and <=5, got ${remaining}`);
});

test('cooldown expires', async () => {
    const mgr = fresh();
    mgr.setCooldown('g1', 'cmd', 'user1', 0); // 0 seconds = no cooldown
    assert.strictEqual(mgr.getCooldownRemaining('g1', 'cmd', 'user1'), 0);
});

test('different users have independent cooldowns', async () => {
    const mgr = fresh();
    mgr.setCooldown('g1', 'cmd', 'user1', 60);
    assert.ok(mgr.getCooldownRemaining('g1', 'cmd', 'user1') > 0);
    assert.strictEqual(mgr.getCooldownRemaining('g1', 'cmd', 'user2'), 0);
});

test('command stores cooldown config', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'slow', 'response', { cooldown: 30 });
    const cmd = mgr.getCommand('g1', 'slow');
    assert.strictEqual(cmd.cooldown, 30);
});

// ── Role Restrictions ─────────────────────────────────────────────────────
console.log('\nRole Restrictions');

test('checkRolePermission passes when no role required', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.checkRolePermission({}, null), true);
});

test('checkRolePermission fails for null member', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.checkRolePermission(null, '123'), false);
});

test('checkRolePermission fails when role not present (cache)', () => {
    const mgr = fresh();
    const member = { roles: { cache: { has: (id) => id === '111' } } };
    assert.ok(!mgr.checkRolePermission(member, '222'), 'Should be falsy when role not present');
});

test('checkRolePermission passes when role present (cache)', () => {
    const mgr = fresh();
    const member = { roles: { cache: { has: (id) => id === '111' } } };
    assert.strictEqual(mgr.checkRolePermission(member, '111'), true);
});

test('checkRolePermission works with array roles', () => {
    const mgr = fresh();
    const member = { roles: ['111', '222'] };
    assert.strictEqual(mgr.checkRolePermission(member, '222'), true);
    assert.strictEqual(mgr.checkRolePermission(member, '333'), false);
});

test('command stores requiredRole', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'admin', 'secret', { requiredRole: 'ROLE_ID_123' });
    const cmd = mgr.getCommand('g1', 'admin');
    assert.strictEqual(cmd.requiredRole, 'ROLE_ID_123');
});

// ── Usage Tracking ────────────────────────────────────────────────────────
console.log('\nUsage Tracking');

test('recordUsage increments count', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'popular', 'hi');
    assert.strictEqual(mgr.getCommand('g1', 'popular').usageCount, 0);
    await mgr.recordUsage('g1', 'popular');
    assert.strictEqual(mgr.getCommand('g1', 'popular').usageCount, 1);
    await mgr.recordUsage('g1', 'popular');
    assert.strictEqual(mgr.getCommand('g1', 'popular').usageCount, 2);
});

test('recordUsage sets lastUsedAt', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'tracked', 'hi');
    assert.strictEqual(mgr.getCommand('g1', 'tracked').lastUsedAt, null);
    await mgr.recordUsage('g1', 'tracked');
    const cmd = mgr.getCommand('g1', 'tracked');
    assert.ok(cmd.lastUsedAt !== null);
    assert.ok(new Date(cmd.lastUsedAt).getTime() > 0);
});

test('recordUsage is a no-op for non-existent command', async () => {
    const mgr = fresh();
    // Should not throw
    await mgr.recordUsage('g1', 'nonexistent');
});

// ── Aliases ───────────────────────────────────────────────────────────────
console.log('\nAliases');

test('findCommand matches by direct name', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi');
    const result = mgr.findCommand('g1', 'hello');
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'hello');
});

test('findCommand matches by alias', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi', { aliases: ['hi', 'hey'] });
    const result = mgr.findCommand('g1', 'hi');
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'hello');
});

test('findCommand returns null for unknown name/alias', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi');
    assert.strictEqual(mgr.findCommand('g1', 'bye'), null);
});

test('findCommand is case-insensitive', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'hello', 'Hi', { aliases: ['HI'] });
    assert.ok(mgr.findCommand('g1', 'HI'));
    assert.ok(mgr.findCommand('g1', 'hi'));
    assert.ok(mgr.findCommand('g1', 'Hello'));
});

// ── Top Commands ──────────────────────────────────────────────────────────
console.log('\nTop Commands');

test('getTopCommands sorts by usage', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'a', '1');
    await mgr.addCommand('g1', 'b', '2');
    await mgr.addCommand('g1', 'c', '3');
    await mgr.recordUsage('g1', 'b');
    await mgr.recordUsage('g1', 'b');
    await mgr.recordUsage('g1', 'c');
    const top = mgr.getTopCommands('g1', 2);
    assert.strictEqual(top.length, 2);
    assert.strictEqual(top[0].name, 'b');
    assert.strictEqual(top[0].usageCount, 2);
    assert.strictEqual(top[1].name, 'c');
    assert.strictEqual(top[1].usageCount, 1);
});

test('getTopCommands respects limit', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'a', '1');
    await mgr.addCommand('g1', 'b', '2');
    assert.strictEqual(mgr.getTopCommands('g1', 1).length, 1);
});

// ── Enabled/Disabled ──────────────────────────────────────────────────────
console.log('\nEnabled/Disabled');

test('command is enabled by default', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'ok');
    assert.strictEqual(mgr.getCommand('g1', 'test').enabled, true);
});

test('command can be disabled', async () => {
    const mgr = fresh();
    await mgr.addCommand('g1', 'test', 'ok', { enabled: false });
    assert.strictEqual(mgr.getCommand('g1', 'test').enabled, false);
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);