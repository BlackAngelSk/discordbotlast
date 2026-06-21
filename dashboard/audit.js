/**
 * Dashboard Audit Logging
 * Handles audit trail for dashboard actions.
 */

const fs = require('fs');
const path = require('path');
const { readJsonFile } = require('./helpers');

const DASHBOARD_AUDIT_FILE = path.join(__dirname, '..', 'data', 'dashboardAudit.json');

let dashboardAuditWriteQueue = Promise.resolve();

/**
 * Queues an audit entry to be written to the audit log file.
 * Entries are capped at 500 most recent.
 */
const queueDashboardAuditEntry = (entry) => {
    dashboardAuditWriteQueue = dashboardAuditWriteQueue
        .then(async () => {
            let logs = [];

            try {
                const content = await fs.promises.readFile(DASHBOARD_AUDIT_FILE, 'utf8');
                logs = JSON.parse(content);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            logs.push(entry);
            if (logs.length > 500) {
                logs = logs.slice(-500);
            }

            await fs.promises.writeFile(DASHBOARD_AUDIT_FILE, JSON.stringify(logs, null, 2));
        })
        .catch((error) => {
            console.error('Dashboard audit log error:', error.message);
        });
};

/**
 * Reads recent dashboard audit entries, optionally filtered by guild.
 */
const readDashboardAuditEntries = ({ guildId = null, limit = 50 } = {}) => {
    const entries = readJsonFile(DASHBOARD_AUDIT_FILE, []);
    return entries
        .filter((entry) => !guildId || !entry.guildId || entry.guildId === guildId)
        .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
        .slice(0, limit);
};

/**
 * Logs a dashboard audit event from an Express request.
 */
const logDashboardAudit = (req, action, details = {}) => {
    queueDashboardAuditEntry({
        timestamp: new Date().toISOString(),
        userId: req.user?.id || 'unknown',
        username: req.user?.username || 'unknown',
        guildId: req.params?.guildId || details.guildId || null,
        action,
        details,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
    });
};

module.exports = {
    DASHBOARD_AUDIT_FILE,
    queueDashboardAuditEntry,
    readDashboardAuditEntries,
    logDashboardAudit
};