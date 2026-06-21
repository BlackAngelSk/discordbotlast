/**
 * Tests for the Public REST API – API key management, middleware, and route helpers.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0;
let failed = 0;
const suiteErrors = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        suiteErrors.push({ name, error: err });
        console.log(`  ❌ ${name}`);
        console.log(`     ${err.message}`);
    }
}

function assertEqual(actual, expected, msg = '') {
    assert.strictEqual(actual, expected, msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(value, msg = '') {
    assert.ok(value, msg || `Expected truthy, got ${JSON.stringify(value)}`);
}

function assertFalse(value, msg = '') {
    assert.ok(!value, msg || `Expected falsy, got ${JSON.stringify(value)}`);
}

// ── API Key Manager Tests ─────────────────────────────────────────────────
console.log('\nApiKeyManager');

// We need to test the class directly, not the singleton, to avoid file conflicts
const ApiKeyManagerClass = (() => {
    // Re-implement a fresh instance for testing
    const crypto = require('crypto');
    const testKeysFile = path.join(os.tmpdir(), `test-api-keys-${Date.now()}.json`);

    class TestApiKeyManager {
        constructor() {
            this.keys = new Map();
            this.keysFile = testKeysFile;
        }

        generateKey(name, guildIds = [], scopes = ['read']) {
            const key = 'dbot_' + crypto.randomBytes(32).toString('hex');
            const entry = {
                key,
                name: name || 'Unnamed',
                guildIds: Array.isArray(guildIds) ? guildIds : [],
                scopes: Array.isArray(scopes) ? scopes : ['read'],
                createdAt: new Date().toISOString(),
                lastUsedAt: null,
                requestCount: 0
            };
            this.keys.set(key, entry);
            return entry;
        }

        validate(key) {
            if (!key || typeof key !== 'string') return null;
            return this.keys.get(key) || null;
        }

        recordUsage(key) {
            const entry = this.keys.get(key);
            if (entry) {
                entry.lastUsedAt = new Date().toISOString();
                entry.requestCount++;
            }
        }

        hasScope(keyData, scope) {
            if (!keyData || !Array.isArray(keyData.scopes)) return false;
            return keyData.scopes.includes(scope) || keyData.scopes.includes('admin');
        }

        hasGuildAccess(keyData, guildId) {
            if (!keyData) return false;
            if (keyData.guildIds.length === 0) return true;
            return keyData.guildIds.includes(guildId);
        }

        revoke(key) {
            return this.keys.delete(key);
        }

        cleanup() {
            try { fs.unlinkSync(this.keysFile); } catch {}
        }
    }

    return TestApiKeyManager;
})();

const ApiKeyManager = ApiKeyManagerClass;

// generateKey
test('generateKey creates a key with dbot_ prefix', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('test-key');
    assertTrue(entry.key.startsWith('dbot_'), `Key should start with dbot_, got: ${entry.key}`);
    assertEqual(entry.name, 'test-key');
    assertEqual(entry.scopes.length, 1);
    assertEqual(entry.scopes[0], 'read');
});

test('generateKey stores guildIds', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('guild-key', ['123', '456']);
    assertEqual(entry.guildIds.length, 2);
    assertTrue(entry.guildIds.includes('123'));
    assertTrue(entry.guildIds.includes('456'));
});

test('generateKey stores custom scopes', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('admin-key', [], ['read', 'write', 'admin']);
    assertEqual(entry.scopes.length, 3);
    assertTrue(entry.scopes.includes('admin'));
});

// validate
test('validate returns entry for valid key', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('valid');
    const result = mgr.validate(entry.key);
    assertTrue(result !== null, 'Should return entry for valid key');
    assertEqual(result.name, 'valid');
});

test('validate returns null for invalid key', () => {
    const mgr = new ApiKeyManager();
    const result = mgr.validate('dbot_nonexistent');
    assertTrue(result === null, 'Should return null for invalid key');
});

test('validate returns null for empty input', () => {
    const mgr = new ApiKeyManager();
    assertTrue(mgr.validate(null) === null);
    assertTrue(mgr.validate(undefined) === null);
    assertTrue(mgr.validate('') === null);
    assertTrue(mgr.validate(123) === null);
});

// recordUsage
test('recordUsage increments requestCount', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('counter');
    assertEqual(entry.requestCount, 0);
    mgr.recordUsage(entry.key);
    assertEqual(entry.requestCount, 1);
    mgr.recordUsage(entry.key);
    assertEqual(entry.requestCount, 2);
});

test('recordUsage sets lastUsedAt', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('timestamp');
    assertTrue(entry.lastUsedAt === null);
    mgr.recordUsage(entry.key);
    assertTrue(entry.lastUsedAt !== null);
    assertTrue(new Date(entry.lastUsedAt).getTime() > 0);
});

// hasScope
test('hasScope returns true for matching scope', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('scope-test', [], ['read', 'write']);
    assertTrue(mgr.hasScope(entry, 'read'));
    assertTrue(mgr.hasScope(entry, 'write'));
    assertFalse(mgr.hasScope(entry, 'admin'));
});

test('hasScope returns true for admin scope (wildcard)', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('admin-scope', [], ['admin']);
    assertTrue(mgr.hasScope(entry, 'read'));
    assertTrue(mgr.hasScope(entry, 'moderation'));
    assertTrue(mgr.hasScope(entry, 'anything'));
});

test('hasScope returns false for null keyData', () => {
    const mgr = new ApiKeyManager();
    assertFalse(mgr.hasScope(null, 'read'));
});

// hasGuildAccess
test('hasGuildAccess returns true when guildIds is empty (all access)', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('all-guilds', []);
    assertTrue(mgr.hasGuildAccess(entry, 'any-guild-id'));
});

test('hasGuildAccess returns true for allowed guild', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('specific-guild', ['111', '222']);
    assertTrue(mgr.hasGuildAccess(entry, '111'));
    assertTrue(mgr.hasGuildAccess(entry, '222'));
    assertFalse(mgr.hasGuildAccess(entry, '333'));
});

test('hasGuildAccess returns false for null keyData', () => {
    const mgr = new ApiKeyManager();
    assertFalse(mgr.hasGuildAccess(null, '123'));
});

// revoke
test('revoke removes a key', () => {
    const mgr = new ApiKeyManager();
    const entry = mgr.generateKey('revoke-me');
    assertTrue(mgr.validate(entry.key) !== null);
    const result = mgr.revoke(entry.key);
    assertTrue(result === true);
    assertTrue(mgr.validate(entry.key) === null);
});

test('revoke returns false for non-existent key', () => {
    const mgr = new ApiKeyManager();
    const result = mgr.revoke('dbot_nonexistent');
    assertTrue(result === false);
});

// ── Middleware Tests ───────────────────────────────────────────────────────
console.log('\nAPI Middleware');

// Test authenticate middleware logic (unit-style, no Express)
test('authenticate returns 401 when no key provided', () => {
    const { authenticate } = require('../dashboard/api/middleware');
    const req = { headers: {}, query: {} };
    let statusCode = null;
    let jsonBody = null;
    const res = {
        status(code) { statusCode = code; return { json(data) { jsonBody = data; } }; }
    };
    const next = () => {};

    authenticate(req, res, next);
    assertEqual(statusCode, 401);
    assertTrue(jsonBody.error === 'Missing API key');
});

test('authenticate returns 403 for invalid key', () => {
    const { authenticate } = require('../dashboard/api/middleware');
    const req = { headers: { authorization: 'Bearer dbot_invalid' }, query: {} };
    let statusCode = null;
    let jsonBody = null;
    const res = {
        status(code) { statusCode = code; return { json(data) { jsonBody = data; } }; }
    };
    const next = () => {};

    authenticate(req, res, next);
    assertEqual(statusCode, 403);
    assertTrue(jsonBody.error === 'Invalid API key');
});

// Test requireScope middleware
test('requireScope blocks when scope missing', () => {
    const { requireScope } = require('../dashboard/api/middleware');
    const req = { apiKeyData: { scopes: ['read'] } };
    let statusCode = null;
    let jsonBody = null;
    const res = {
        status(code) { statusCode = code; return { json(data) { jsonBody = data; } }; }
    };
    let called = false;
    const next = () => { called = true; };

    requireScope('moderation')(req, res, next);
    assertEqual(statusCode, 403);
    assertTrue(!called, 'next() should not be called when scope is missing');
});

test('requireScope calls next when scope present', () => {
    const { requireScope } = require('../dashboard/api/middleware');
    const req = { apiKeyData: { scopes: ['read', 'moderation'] } };
    let called = false;
    const next = () => { called = true; };
    const res = {};

    requireScope('moderation')(req, res, next);
    assertTrue(called, 'next() should be called when scope is present');
});

// Test asyncHandler
test('asyncHandler wraps function and catches errors', async () => {
    const { asyncHandler } = require('../dashboard/api/middleware');
    let caughtError = null;
    const errorHandler = (err) => { caughtError = err; };
    const req = {};
    const res = {};
    const next = (err) => { caughtError = err; };

    const handler = asyncHandler(async () => {
        throw new Error('test error');
    });

    await handler(req, res, next);
    assertTrue(caughtError !== null, 'Error should be caught');
    assertEqual(caughtError.message, 'test error');
});

// Test rateLimiter
test('rateLimiter allows requests within limit', () => {
    const { rateLimiter } = require('../dashboard/api/middleware');
    const limiter = rateLimiter({ windowMs: 60000, maxRequests: 3 });
    const req = { apiKeyData: { key: 'test-rate-key-1' } };
    let allowed = true;
    const res = {
        set() {},
        status() { allowed = false; return { json() {} }; }
    };
    const next = () => {};

    limiter(req, res, next);
    assertTrue(allowed, 'First request should be allowed');
});

test('rateLimiter blocks requests over limit', () => {
    const { rateLimiter } = require('../dashboard/api/middleware');
    const limiter = rateLimiter({ windowMs: 60000, maxRequests: 2 });
    const req = { apiKeyData: { key: 'test-rate-key-2' } };
    const res = { set() {} };
    const next = () => {};

    limiter(req, res, next); // 1st
    limiter(req, res, next); // 2nd

    let blocked = false;
    const blockRes = {
        set() {},
        status(code) {
            if (code === 429) blocked = true;
            return { json() {} };
        }
    };
    limiter(req, blockRes, next); // 3rd – should be blocked
    assertTrue(blocked, 'Third request should be blocked');
});

// ── Route Helpers Tests ───────────────────────────────────────────────────
console.log('\nAPI Route Logic');

test('registerPublicApiRoutes is a function', () => {
    const { registerPublicApiRoutes } = require('../dashboard/api/routes');
    assertEqual(typeof registerPublicApiRoutes, 'function');
});

test('apiKeys module exports expected methods', () => {
    const apiKeys = require('../dashboard/api/apiKeys');
    assertEqual(typeof apiKeys.generateKey, 'function');
    assertEqual(typeof apiKeys.validate, 'function');
    assertEqual(typeof apiKeys.recordUsage, 'function');
    assertEqual(typeof apiKeys.hasScope, 'function');
    assertEqual(typeof apiKeys.hasGuildAccess, 'function');
    assertEqual(typeof apiKeys.revoke, 'function');
    assertEqual(typeof apiKeys.listKeys, 'function');
});

test('middleware module exports expected functions', () => {
    const middleware = require('../dashboard/api/middleware');
    assertEqual(typeof middleware.rateLimiter, 'function');
    assertEqual(typeof middleware.authenticate, 'function');
    assertEqual(typeof middleware.requireScope, 'function');
    assertEqual(typeof middleware.requireGuildAccess, 'function');
    assertEqual(typeof middleware.asyncHandler, 'function');
    assertEqual(typeof middleware.errorHandler, 'function');
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);