/**
 * Error Log Manager – structured interface for querying and managing error logs.
 * Reads from the logs/ directory produced by ErrorHandler.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

class ErrorLogManager {
    constructor(logDir = LOG_DIR) {
        this.logDir = logDir;
    }

    /**
     * Get all error log files sorted by date (newest first).
     */
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

    /**
     * Read errors from a specific date string (YYYY-MM-DD).
     */
    readLogForDate(dateStr) {
        const file = path.join(this.logDir, `error-${dateStr}.json`);
        try {
            if (!fs.existsSync(file)) return [];
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            return [];
        }
    }

    /**
     * Get recent errors across multiple days.
     * @param {object} opts
     * @param {number} opts.days – number of days to look back (default 7)
     * @param {number} opts.limit – max entries to return (default 100)
     * @param {string} opts.type – filter by error type
     * @param {string} opts.search – search in message/stack
     * @returns {Array} sorted newest-first
     */
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

        // Sort newest first
        filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        return filtered.slice(0, limit);
    }

    /**
     * Get error summary/statistics.
     * @param {number} days
     */
    getErrorStats(days = 7) {
        const entries = this.getRecentErrors({ days, limit: 10000 });

        const byType = {};
        const byDay = {};
        let total = entries.length;

        for (const entry of entries) {
            const type = entry.type || 'UNKNOWN';
            byType[type] = (byType[type] || 0) + 1;

            const day = (entry.timestamp || '').split('T')[0] || 'unknown';
            byDay[day] = (byDay[day] || 0) + 1;
        }

        // Top error messages
        const messageCounts = {};
        for (const entry of entries) {
            const msg = (entry.message || 'Unknown').slice(0, 120);
            messageCounts[msg] = (messageCounts[msg] || 0) + 1;
        }
        const topMessages = Object.entries(messageCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([message, count]) => ({ message, count }));

        return {
            total,
            byType,
            byDay,
            topMessages,
            days,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Clear logs older than the given number of days.
     */
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
        } catch {
            // Silent fail
        }

        return removed;
    }

    /**
     * Get the total number of error log files and their size.
     */
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

module.exports = new ErrorLogManager();