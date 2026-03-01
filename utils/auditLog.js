const fs = require('fs');
const path = require('path');

class AuditLog {
    constructor(options = {}) {
        this.logsDir = path.join(__dirname, '../logs/audit');
        this.auditFile = path.join(this.logsDir, `audit-${new Date().toISOString().split('T')[0]}.json`);
        this.maxEntriesPerFile = options.maxEntriesPerFile || 5000;
        this.daysToKeep = options.daysToKeep || 90;
        
        this.initializeLogsDir();
        this.setupCleanup();
    }

    initializeLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    setupCleanup() {
        // Clean up old audit logs every day
        setInterval(() => this.cleanupOldLogs(), 24 * 60 * 60 * 1000);
    }

    /**
     * Log an audit event
     * @param {object} options - Audit event details
     */
    logAction(options) {
        const {
            action,
            category,
            executor, // User who performed the action
            target, // User/role/channel affected
            guildId,
            details = {},
            severity = 'info' // info, warn, critical
        } = options;

        const entry = {
            timestamp: new Date().toISOString(),
            action,
            category,
            executor: {
                id: executor?.id,
                tag: executor?.tag,
                username: executor?.username
            },
            target: target ? {
                id: target?.id,
                tag: target?.tag || target?.name,
                type: target?.tag ? 'user' : 'role' // Determine type
            } : null,
            guildId,
            severity,
            details
        };

        this.saveEntry(entry);
        return entry;
    }

    /**
     * Log moderation action
     * @param {object} options - Moderation details
     */
    logModerationAction(options) {
        const {
            action, // ban, kick, mute, warn, unmute, unban
            executor,
            target,
            guildId,
            reason = '',
            duration = null
        } = options;

        return this.logAction({
            action,
            category: 'moderation',
            executor,
            target,
            guildId,
            severity: ['ban', 'kick'].includes(action) ? 'critical' : 'warn',
            details: {
                reason,
                duration
            }
        });
    }

    /**
     * Log configuration change
     * @param {object} options - Config change details
     */
    logConfigChange(options) {
        const {
            setting,
            oldValue,
            newValue,
            executor,
            guildId
        } = options;

        return this.logAction({
            action: 'config_change',
            category: 'configuration',
            executor,
            guildId,
            severity: ['prefix', 'owner'].includes(setting) ? 'critical' : 'warn',
            details: {
                setting,
                oldValue: String(oldValue),
                newValue: String(newValue)
            }
        });
    }

    /**
     * Log role action
     * @param {object} options - Role action details
     */
    logRoleAction(options) {
        const {
            action, // create, delete, update, assign, remove
            role,
            executor,
            target, // User role was assigned/removed from
            guildId
        } = options;

        return this.logAction({
            action,
            category: 'role_management',
            executor,
            target,
            guildId,
            severity: action === 'delete' ? 'critical' : 'warn',
            details: {
                roleId: role?.id,
                roleName: role?.name,
                roleColor: role?.hexColor
            }
        });
    }

    /**
     * Log channel action
     * @param {object} options - Channel action details
     */
    logChannelAction(options) {
        const {
            action, // create, delete, update
            channel,
            executor,
            guildId,
            changes = {}
        } = options;

        return this.logAction({
            action,
            category: 'channel_management',
            executor,
            guildId,
            severity: action === 'delete' ? 'critical' : 'warn',
            details: {
                channelId: channel?.id,
                channelName: channel?.name,
                channelType: channel?.type,
                changes
            }
        });
    }

    /**
     * Log permission change
     * @param {object} options - Permission change details
     */
    logPermissionChange(options) {
        const {
            executor,
            target, // User or role
            guildId,
            permissions = {}
        } = options;

        return this.logAction({
            action: 'permission_change',
            category: 'permissions',
            executor,
            target,
            guildId,
            severity: 'critical',
            details: {
                permissions
            }
        });
    }

    /**
     * Log economic action
     * @param {object} options - Economy action details
     */
    logEconomyAction(options) {
        const {
            action, // add, remove, set, transfer
            executor,
            target,
            guildId,
            amount,
            reason = ''
        } = options;

        return this.logAction({
            action,
            category: 'economy',
            executor,
            target,
            guildId,
            details: {
                amount,
                reason
            }
        });
    }

    /**
     * Save entry to file
     * @param {object} entry - Audit entry
     */
    saveEntry(entry) {
        try {
            let entries = [];

            if (fs.existsSync(this.auditFile)) {
                const content = fs.readFileSync(this.auditFile, 'utf8');
                entries = JSON.parse(content);
            }

            entries.push(entry);

            // Rotate file if too large
            if (entries.length > this.maxEntriesPerFile) {
                const oldEntries = entries.slice(0, entries.length - this.maxEntriesPerFile);
                const newEntries = entries.slice(-this.maxEntriesPerFile);

                // Archive old entries
                const archiveFile = path.join(this.logsDir, `audit-archive-${Date.now()}.json`);
                fs.writeFileSync(archiveFile, JSON.stringify(oldEntries, null, 2));

                entries = newEntries;
            }

            fs.writeFileSync(this.auditFile, JSON.stringify(entries, null, 2));
        } catch (e) {
            console.error('Failed to save audit entry:', e);
        }
    }

    /**
     * Get audit logs with filters
     * @param {object} options - Filter options
     * @returns {array} - Filtered audit entries
     */
    getAuditLogs(options = {}) {
        const {
            action = null,
            category = null,
            executorId = null,
            targetId = null,
            guildId = null,
            severity = null,
            days = 30,
            limit = 100,
            offset = 0
        } = options;

        try {
            let entries = [];
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

            // Read all audit files from the period
            const files = fs.readdirSync(this.logsDir)
                .filter(f => f.startsWith('audit-') && f.endsWith('.json'))
                .sort()
                .reverse();

            for (const file of files) {
                const filePath = path.join(this.logsDir, file);
                const stat = fs.statSync(filePath);

                if (stat.mtimeMs < cutoff) break; // Older than cutoff

                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    entries.push(...content);
                } catch (e) {
                    console.error(`Failed to read audit file ${file}:`, e);
                }
            }

            // Filter entries
            let filtered = entries.filter(entry => {
                if (action && entry.action !== action) return false;
                if (category && entry.category !== category) return false;
                if (executorId && entry.executor?.id !== executorId) return false;
                if (targetId && entry.target?.id !== targetId) return false;
                if (guildId && entry.guildId !== guildId) return false;
                if (severity && entry.severity !== severity) return false;
                return true;
            });

            // Sort by timestamp descending and apply pagination
            filtered = filtered
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(offset, offset + limit);

            return filtered;
        } catch (e) {
            console.error('Failed to get audit logs:', e);
            return [];
        }
    }

    /**
     * Get audit statistics
     * @param {object} options - Stats options
     * @returns {object} - Statistics
     */
    getStats(options = {}) {
        const logs = this.getAuditLogs({ ...options, limit: 10000 });

        const stats = {
            total: logs.length,
            byCategory: {},
            byAction: {},
            byExecutor: {},
            byTarget: {},
            bySeverity: {}
        };

        for (const log of logs) {
            // Count by category
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;

            // Count by action
            stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;

            // Count by executor
            if (log.executor?.id) {
                const key = `${log.executor.tag}`;
                stats.byExecutor[key] = (stats.byExecutor[key] || 0) + 1;
            }

            // Count by target
            if (log.target?.id) {
                const key = `${log.target.tag}`;
                stats.byTarget[key] = (stats.byTarget[key] || 0) + 1;
            }

            // Count by severity
            stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
        }

        return stats;
    }

    /**
     * Get action history for executor
     * @param {string} executorId - User ID
     * @param {number} limit - Number of results
     * @returns {array} - Recent actions by executor
     */
    getExecutorHistory(executorId, limit = 50) {
        return this.getAuditLogs({
            executorId,
            limit,
            days: 90
        });
    }

    /**
     * Get action history for target
     * @param {string} targetId - User/Role ID
     * @param {number} limit - Number of results
     * @returns {array} - Recent actions affecting target
     */
    getTargetHistory(targetId, limit = 50) {
        return this.getAuditLogs({
            targetId,
            limit,
            days: 90
        });
    }

    /**
     * Clean up old audit logs
     */
    cleanupOldLogs() {
        try {
            const cutoff = Date.now() - (this.daysToKeep * 24 * 60 * 60 * 1000);
            const files = fs.readdirSync(this.logsDir);

            for (const file of files) {
                if (!file.startsWith('audit-')) continue;

                const filePath = path.join(this.logsDir, file);
                const stat = fs.statSync(filePath);

                if (stat.mtimeMs < cutoff) {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up old audit log: ${file}`);
                }
            }
        } catch (e) {
            console.error('Failed to cleanup old audit logs:', e);
        }
    }
}

module.exports = AuditLog;
