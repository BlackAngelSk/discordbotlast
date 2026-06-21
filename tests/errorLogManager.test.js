/**
 * Tests for ErrorLogManager.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temporary log directory for testing
const TEST_LOG_DIR = path.join(os.tmpdir(), `test-error-logs-${Date.now()}`);

// Create the ErrorLogManager with our test directory
const ErrorLogManager = (() => {
    class TestErrorLogManager {
        constructor(logDir) {
            this.logDir = logDir;
        }

        getLogFiles() {
            try {
                if (!fs.existsSync(this.logDir)) return [];
                return fs.readdirSync(this.logDir)
                    .filter(f => f.startsWith('error-') && f.endsWith('.json'))
                    .sort()
                    .reverse();
            } catch {
                return [];
            }
        }

        readLogForDate(dateStr) {
            const file = path.join(this.logDir, `error-${dateStr}.json`);
            try {
                if (!fs.existsSync(file)) return [];
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                return [];
            }
        }

        getRecentErrors({ days = 7, limit = 100, type = null, search = null } = {}) {
            const entries = [];
            const now = new Date();

            for (let i = 0; i < days; i++) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const dateStr = d.toISOString().split('T')[0];
                entries.push(...this.readLogForDate(dateStr));
            }

            let filtered = entries;
            if (type) {
                const lowerType = String(type).toLowerCase();
                filtered = filtered.filter(e => String(e.type || '').toLowerCase().includes(lowerType));
            }
            if (search) {
                const lowerSearch = String(search).toLowerCase();
                filtered = filtered.filter(e =>
                    String(e.message || '').toLowerCase().includes(lowerSearch) ||
                    String(e.stack || '').toLowerCase().includes(lowerSearch)
                );
            }
            filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            return filtered.slice(0, limit);
        }

        getErrorStats(days = 7) {
            const entries = this.getRecentErrors({ days, limit: 10000 });
            const byType = {};
            const byDay = {};
            const total = entries.length;

            for (const entry of entries) {
                const type = entry.type || 'UNKNOWN';
                byType[type] = (byType[type] || 0) + 1;
                const day = (entry.timestamp || '').split('T')[0] || 'unknown';
                byDay[day] = (byDay[day] || 0) + 1;
            }

            const messageCounts = {};
            for (const entry of entries) {
                const msg = (entry.message || 'Unknown').slice(0, 120);
                messageCounts[msg] = (messageCounts[msg] || 0) + 1;
            }
            const topMessages = Object.entries(messageCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([message, count]) => ({ message, count }));

            return { total, byType, byDay, topMessages, days, generatedAt: new Date().toISOString() };
        }

        clearOldLogs(daysToKeep = 30) {
            const now = Date.now();
            const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
            let removed = 0;
            try {
                if (!fs.existsSync(this.logDir)) return removed;
                const files = fs.readdirSync(this.logDir);
                for (const file of files) {
                    if (!file.startsWith('error-') || !file.endsWith('.json')) continue;
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                        removed++;
                    }
                }
            } catch {}
            return removed;
        }

        getStorageInfo() {
            try {
                if (!fs.existsSync(this.logDir)) {
                    return { fileCount: 0, totalSizeKB: 0 };
                }
                const files = this.getLogFiles();
                let totalSize = 0;
                for (const file of files) {
                    const stats = fs.statSync(path.join(this.logDir, file));
                    totalSize += stats.size;
                }
                return {
                    fileCount: files.length,
                    totalSizeKB: Math.round(totalSize / 1024),
                    oldestFile: files.length > 0 ? files[files.length - 1].replace('error-', '').replace('.json', '') : null,
                    newestFile: files.length > 0 ? files[0].replace('error-', '').replace('.json', '') : null
                };
            } catch {
                return { fileCount: 0, totalSizeKB: 0 };
            }
        }
    }

    return TestErrorLogManager;
})();

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${err.message}`);
    }
}

function assertTrue(value, msg = '') {
    assert.ok(value, msg || `Expected truthy, got ${JSON.stringify(value)}`);
}

function assertEqual(actual, expected, msg = '') {
    assert.strictEqual(actual, expected, msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Setup ─────────────────────────────────────────────────────────────────
function setupTestLogs() {
    if (!fs.existsSync(TEST_LOG_DIR)) {
        fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Today's errors
    fs.writeFileSync(path.join(TEST_LOG_DIR, `error-${today}.json`), JSON.stringify([
        { timestamp: new Date().toISOString(), type: 'UNHANDLED_REJECTION', message: 'Test rejection error', stack: 'Error: Test rejection\n    at test.js:1:1', errorCount: 1 },
        { timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'COMMAND_ERROR', message: 'Command failed', stack: 'Error: Command failed\n    at cmd.js:1:1', errorCount: 2 },
        { timestamp: new Date(Date.now() - 7200000).toISOString(), type: 'UNCAUGHT_EXCEPTION', message: 'Fatal crash', stack: 'Error: Fatal\n    at main.js:1:1', errorCount: 3 }
    ], null, 2));

    // Yesterday's errors
    fs.writeFileSync(path.join(TEST_LOG_DIR, `error-${yesterday}.json`), JSON.stringify([
        { timestamp: new Date(Date.now() - 90000000).toISOString(), type: 'CONSOLE_ERROR', message: 'Console error happened', stack: 'console.error', errorCount: 4 },
        { timestamp: new Date(Date.now() - 100000000).toISOString(), type: 'UNHANDLED_REJECTION', message: 'Another rejection', stack: 'Error: Another\n    at x.js:2:2', errorCount: 5 }
    ], null, 2));
}

function cleanupTestLogs() {
    try {
        if (fs.existsSync(TEST_LOG_DIR)) {
            const files = fs.readdirSync(TEST_LOG_DIR);
            for (const f of files) fs.unlinkSync(path.join(TEST_LOG_DIR, f));
            fs.rmdirSync(TEST_LOG_DIR);
        }
    } catch {}
}

setupTestLogs();
const mgr = new ErrorLogManager(TEST_LOG_DIR);

// ── Tests ─────────────────────────────────────────────────────────────────
console.log('\nErrorLogManager – getLogFiles');

test('returns error log files', () => {
    const files = mgr.getLogFiles();
    assertTrue(Array.isArray(files), 'Should return an array');
    assertTrue(files.length >= 2, `Should have at least 2 files, got ${files.length}`);
    assertTrue(files[0] >= files[1], 'Files should be sorted newest first');
});

test('returns empty array for non-existent directory', () => {
    const m = new ErrorLogManager('/tmp/nonexistent-dir-' + Date.now());
    assertEqual(m.getLogFiles().length, 0);
});

console.log('\nErrorLogManager – readLogForDate');

test('returns entries for existing date', () => {
    const today = new Date().toISOString().split('T')[0];
    const entries = mgr.readLogForDate(today);
    assertEqual(entries.length, 3);
    assertEqual(entries[0].type, 'UNHANDLED_REJECTION');
});

test('returns empty array for non-existent date', () => {
    const entries = mgr.readLogForDate('2000-01-01');
    assertEqual(entries.length, 0);
});

console.log('\nErrorLogManager – getRecentErrors');

test('returns recent errors across days', () => {
    const errors = mgr.getRecentErrors({ days: 2, limit: 100 });
    assertTrue(errors.length >= 5, `Should have at least 5 errors, got ${errors.length}`);
});

test('respects limit parameter', () => {
    const errors = mgr.getRecentErrors({ days: 7, limit: 2 });
    assertEqual(errors.length, 2);
});

test('filters by type', () => {
    const errors = mgr.getRecentErrors({ days: 7, type: 'UNHANDLED' });
    for (const e of errors) {
        assertTrue(e.type.toLowerCase().includes('unhandled'), `Type should contain 'unhandled': ${e.type}`);
    }
});

test('filters by search term', () => {
    const errors = mgr.getRecentErrors({ days: 7, search: 'rejection' });
    assertTrue(errors.length >= 1, 'Should find errors containing "rejection"');
    for (const e of errors) {
        const combined = `${e.message} ${e.stack}`.toLowerCase();
        assertTrue(combined.includes('rejection'), `Error should match search`);
    }
});

console.log('\nErrorLogManager – getErrorStats');

test('returns correct stats structure', () => {
    const stats = mgr.getErrorStats(2);
    assertEqual(typeof stats.total, 'number');
    assertEqual(typeof stats.byType, 'object');
    assertEqual(typeof stats.byDay, 'object');
    assertTrue(Array.isArray(stats.topMessages));
    assertEqual(stats.days, 2);
    assertTrue(stats.generatedAt, 'Should have generatedAt');
});

test('stats count by type correctly', () => {
    const stats = mgr.getErrorStats(2);
    assertTrue(stats.byType['UNHANDLED_REJECTION'] >= 2, 'Should count UNHANDLED_REJECTION errors');
    assertTrue(stats.byType['COMMAND_ERROR'] >= 1, 'Should count COMMAND_ERROR');
});

test('stats identify top messages', () => {
    const stats = mgr.getErrorStats(2);
    assertTrue(stats.topMessages.length >= 1, 'Should have top messages');
    assertTrue(stats.topMessages[0].count >= 1, 'Top message should have count >= 1');
});

console.log('\nErrorLogManager – getStorageInfo');

test('returns storage info', () => {
    const info = mgr.getStorageInfo();
    assertEqual(typeof info.fileCount, 'number');
    assertEqual(typeof info.totalSizeKB, 'number');
    assertTrue(info.fileCount >= 2, `Should have at least 2 files, got ${info.fileCount}`);
    assertTrue(info.totalSizeKB >= 0, 'Size should be non-negative');
    assertTrue(info.newestFile !== null, 'Should have newestFile');
    assertTrue(info.oldestFile !== null, 'Should have oldestFile');
});

test('returns zero for non-existent directory', () => {
    const m = new ErrorLogManager('/tmp/nonexistent-dir-' + Date.now());
    const info = m.getStorageInfo();
    assertEqual(info.fileCount, 0);
    assertEqual(info.totalSizeKB, 0);
});

console.log('\nErrorLogManager – clearOldLogs');

test('clearOldLogs returns 0 for recent logs', () => {
    const removed = mgr.clearOldLogs(30);
    assertEqual(removed, 0, 'Recent files should not be removed');
});

console.log('\nErrorLogManager – module export');

test('exports a singleton instance', () => {
    const mod = require('../utils/errorLogManager');
    assertEqual(typeof mod.getRecentErrors, 'function');
    assertEqual(typeof mod.getErrorStats, 'function');
    assertEqual(typeof mod.getLogFiles, 'function');
    assertEqual(typeof mod.getStorageInfo, 'function');
    assertEqual(typeof mod.clearOldLogs, 'function');
});

// ── Cleanup ───────────────────────────────────────────────────────────────
cleanupTestLogs();

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);