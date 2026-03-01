const fs = require('fs');
const path = require('path');

class Logger {
    constructor(botClient) {
        this.client = botClient;
        this.logDirectory = path.join(__dirname, '../logs');
        this.dataDirectory = path.join(__dirname, '../data');
        this.logFile = path.join(this.logDirectory, `bot-${new Date().toISOString().split('T')[0]}.json`);
        this.initializeDirectories();
        this.logs = [];
    }

    initializeDirectories() {
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
    }

    /**
     * Log a message
     * @param {string} level - Log level (info, warn, error, debug, success)
     * @param {string} message - Log message
     * @param {object} metadata - Additional metadata
     */
    log(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            metadata,
            pid: process.pid
        };

        this.logs.push(logEntry);
        this.saveLog(logEntry);

        // Console output with colors
        const colors = {
            info: '\x1b[36m',    // Cyan
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            debug: '\x1b[35m',   // Magenta
            success: '\x1b[32m', // Green
            reset: '\x1b[0m'
        };

        const color = colors[level] || colors.info;
        console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset} ${message}`, 
            Object.keys(metadata).length > 0 ? metadata : '');
    }

    info(message, metadata = {}) {
        this.log('info', message, metadata);
    }

    warn(message, metadata = {}) {
        this.log('warn', message, metadata);
    }

    error(message, metadata = {}) {
        this.log('error', message, metadata);
    }

    debug(message, metadata = {}) {
        this.log('debug', message, metadata);
    }

    success(message, metadata = {}) {
        this.log('success', message, metadata);
    }

    /**
     * Log command execution
     * @param {object} interaction - Discord interaction
     * @param {string} commandName - Command name
     * @param {boolean} success - Whether command succeeded
     * @param {string} error - Error message if failed
     */
    logCommand(interaction, commandName, success = true, error = null) {
        const metadata = {
            userId: interaction.user.id,
            userName: interaction.user.tag,
            guildId: interaction.guild?.id,
            guildName: interaction.guild?.name,
            commandName,
            success,
            duration: interaction.createdTimestamp ? Date.now() - interaction.createdTimestamp : 0
        };

        if (error) metadata.error = error;

        this.log(success ? 'info' : 'warn', `Command executed: ${commandName}`, metadata);
    }

    /**
     * Log moderation action
     * @param {object} options - Moderation details
     */
    logModerationAction(options) {
        const {
            action, // ban, kick, mute, warn, etc.
            executor, // User who performed action
            target, // User affected
            guildId,
            reason,
            duration
        } = options;

        const metadata = {
            action,
            executorId: executor?.id,
            executorTag: executor?.tag,
            targetId: target?.id,
            targetTag: target?.tag,
            guildId,
            reason,
            duration
        };

        this.log('warn', `Moderation Action: ${action}`, metadata);
    }

    /**
     * Log voice activity
     * @param {string} userId - User ID
     * @param {string} action - join/leave/switch
     * @param {string} channelId - Voice channel ID
     * @param {string} channelName - Voice channel name
     * @param {number} duration - Duration in voice (for leave event)
     */
    logVoiceActivity(userId, action, channelId, channelName, duration = 0) {
        const metadata = {
            userId,
            action,
            channelId,
            channelName,
            duration
        };

        this.log('info', `Voice Activity: ${action}`, metadata);
    }

    /**
     * Log economy transaction
     * @param {string} userId - User ID
     * @param {string} type - Transaction type (earn, spend, transfer)
     * @param {number} amount - Amount
     * @param {string} source - What triggered the transaction
     */
    logEconomyTransaction(userId, type, amount, source) {
        const metadata = {
            userId,
            type,
            amount,
            source
        };

        this.log('info', `Economy Transaction: ${type} ${amount}`, metadata);
    }

    /**
     * Log guild event
     * @param {string} event - Event type
     * @param {string} guildId - Guild ID
     * @param {object} metadata - Additional metadata
     */
    logGuildEvent(event, guildId, metadata = {}) {
        this.log('info', `Guild Event: ${event}`, {
            guildId,
            ...metadata
        });
    }

    /**
     * Save log entry to file
     * @param {object} logEntry - Log entry to save
     */
    saveLog(logEntry) {
        try {
            let logs = [];
            
            if (fs.existsSync(this.logFile)) {
                const content = fs.readFileSync(this.logFile, 'utf8');
                logs = JSON.parse(content);
            }

            logs.push(logEntry);

            // Keep only last 10000 entries per file
            if (logs.length > 10000) {
                logs = logs.slice(-10000);
            }

            fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));
        } catch (e) {
            console.error('Failed to save log:', e);
        }
    }

    /**
     * Get logs with filters
     * @param {object} options - Filter options
     * @returns {array} - Filtered logs
     */
    getLogs(options = {}) {
        const {
            level = null,
            hours = 24,
            limit = 100,
            startIndex = 0
        } = options;

        const now = Date.now();
        const cutoff = now - (hours * 60 * 60 * 1000);

        let filtered = this.logs.filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            if (logTime < cutoff) return false;
            if (level && log.level !== level.toUpperCase()) return false;
            return true;
        });

        return filtered.slice(startIndex, startIndex + limit);
    }

    /**
     * Get statistics about logs
     * @returns {object} - Log statistics
     */
    getStats() {
        const stats = {
            totalLogs: this.logs.length,
            byLevel: {},
            today: 0,
            thisHour: 0
        };

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneHourAgo = now - (60 * 60 * 1000);

        this.logs.forEach(log => {
            const logTime = new Date(log.timestamp).getTime();
            
            // Count by level
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            
            // Count today
            if (logTime > oneDayAgo) stats.today++;
            
            // Count this hour
            if (logTime > oneHourAgo) stats.thisHour++;
        });

        return stats;
    }

    /**
     * Clean up old log files
     * @param {number} daysToKeep - Days of logs to keep
     */
    cleanupOldLogs(daysToKeep = 30) {
        try {
            const files = fs.readdirSync(this.logDirectory);
            const now = Date.now();
            const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                if (file.startsWith('bot-') && file.endsWith('.json')) {
                    const filePath = path.join(this.logDirectory, file);
                    const stats = fs.statSync(filePath);
                    
                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                        this.debug(`Cleaned up old log file: ${file}`);
                    }
                }
            });
        } catch (e) {
            this.error('Failed to cleanup old logs:', { error: e.message });
        }
    }
}

module.exports = Logger;
