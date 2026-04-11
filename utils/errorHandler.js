const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ErrorHandler {
    constructor(client) {
        this.client = client;
        this.logDirectory = path.join(__dirname, '../logs');
        this.dmRecipientId = process.env.ERROR_DM_USER_ID || process.env.BOT_OWNER_ID || null;
        this.errorChannelId = process.env.ERROR_CHANNEL_ID || null;
        this.initializeLogDirectory();
        this.errorCount = 0;
        this.notificationQueue = [];
        this.isSendingNotification = false;
        this.consolePatched = false;
        this.warningFilterPatched = false;
        this.baseConsoleError = console.error.bind(console);
        this.setupWarningFilter();
        this.setupHandlers();
        this.setupConsoleInterceptor();
        this.setupReadyListener();
    }

    initializeLogDirectory() {
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
    }

    setupWarningFilter() {
        if (this.warningFilterPatched || typeof process.emitWarning !== 'function') {
            return;
        }

        const originalEmitWarning = process.emitWarning.bind(process);
        process.emitWarning = (warning, ...args) => {
            const normalizedWarning = this.normalizeWarning(warning, args);
            if (this.shouldIgnoreWarning(normalizedWarning)) {
                return;
            }
            return originalEmitWarning(warning, ...args);
        };

        this.warningFilterPatched = true;
    }

    normalizeWarning(warning, args = []) {
        if (warning instanceof Error) {
            return warning;
        }

        const warningName = typeof args[0] === 'string'
            ? args[0]
            : typeof warning?.type === 'string'
                ? warning.type
                : 'Warning';

        const warningMessage = typeof warning === 'string'
            ? warning
            : typeof warning?.message === 'string'
                ? warning.message
                : String(warning);

        const normalizedWarning = new Error(warningMessage);
        normalizedWarning.name = warningName;

        if (typeof warning?.stack === 'string') {
            normalizedWarning.stack = warning.stack;
        }

        return normalizedWarning;
    }

    setupHandlers() {
        // Unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.logError('UNHANDLED_REJECTION', reason, { promise });
        });

        // Uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.logError('UNCAUGHT_EXCEPTION', error);
        });

        // Warning events
        process.on('warning', (warning) => {
            if (this.shouldIgnoreWarning(warning)) {
                return;
            }
            this.logError('PROCESS_WARNING', warning);
        });
    }

    setupConsoleInterceptor() {
        if (this.consolePatched) {
            return;
        }

        const originalConsoleError = this.baseConsoleError;

        console.error = (...args) => {
            originalConsoleError(...args);

            const payload = this.serializeConsoleArgs(args);
            if (!payload) {
                return;
            }

            this.queueAdminNotification({
                type: 'CONSOLE_ERROR',
                message: payload.message,
                stack: payload.details,
                context: {
                    source: 'console.error'
                }
            });
        };

        this.consolePatched = true;
    }

    setupReadyListener() {
        if (!this.client || typeof this.client.once !== 'function') {
            return;
        }

        this.client.once('clientReady', () => {
            this.processNotificationQueue().catch((error) => {
                this.writeInternalError('Failed to flush queued error DMs:', error);
            });
        });
    }

    shouldIgnoreWarning(warning) {
        if (!warning) return false;

        const warningName = typeof warning.name === 'string' ? warning.name : '';
        const warningMessage = typeof warning.message === 'string' ? warning.message : String(warning);
        const isTimeoutNegative =
            warningName === 'TimeoutNegativeWarning' ||
            warningMessage.includes('TimeoutNegativeWarning') ||
            warningMessage.includes('is a negative number');
        if (!isTimeoutNegative) return false;

        const stack = typeof warning.stack === 'string' ? warning.stack : '';
        const isFromDiscordVoice =
            stack.includes('@discordjs/voice') ||
            stack.includes('@discordjs\\voice') ||
            warningMessage.includes('@discordjs/voice') ||
            warningMessage.includes('@discordjs\\voice');

        // Known benign timing jitter warning from @discordjs/voice under load.
        return isFromDiscordVoice;
    }

    logError(type, error, context = {}) {
        this.errorCount++;
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.stack : String(error);

        const logEntry = {
            timestamp,
            type,
            message: error instanceof Error ? error.message : String(error),
            stack: errorMessage,
            context,
            errorCount: this.errorCount
        };

        this.baseConsoleError(`[${timestamp}] ${type}:`, error);

        // File log
        const logFile = path.join(this.logDirectory, `error-${new Date().toISOString().split('T')[0]}.json`);
        try {
            let logs = [];
            if (fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                logs = JSON.parse(content);
            }
            logs.push(logEntry);
            fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        } catch (e) {
            this.writeInternalError('Failed to write error log:', e);
        }

        this.queueAdminNotification(logEntry);

        // Notify admin if error count is high
        if (this.errorCount > 10 && this.errorCount % 5 === 0) {
            this.notifyAdmin(logEntry);
        }
    }

    handleCommandError(interaction, error, commandName) {
        const errorId = `ERR_${Date.now()}`;
        
        this.logError('COMMAND_ERROR', error, {
            command: commandName,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id,
            errorId
        });

        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('⚠️ Command Error')
            .setDescription(`An error occurred while executing the command.`)
            .addFields(
                { name: 'Error ID', value: errorId, inline: true },
                { name: 'Command', value: commandName, inline: true },
                { name: 'Message', value: error.message || 'Unknown error', inline: false }
            )
            .setTimestamp();

        try {
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
            } else {
                interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => {});
            }
        } catch (e) {
            this.writeInternalError('Failed to send error embed:', e);
        }
    }

    notifyAdmin(logEntry) {
        this.queueAdminNotification(logEntry);
    }

    serializeConsoleArgs(args = []) {
        if (!Array.isArray(args) || args.length === 0) {
            return null;
        }

        const parts = args.map((arg) => this.normalizeErrorValue(arg));
        const compactParts = parts.filter(Boolean);
        const details = compactParts.join('\n');
        if (!details) {
            return null;
        }

        const message = compactParts[0].slice(0, 1000);

        return {
            message,
            details: details.slice(0, 3500)
        };
    }

    normalizeErrorValue(value) {
        if (value instanceof Error) {
            return value.stack || `${value.name}: ${value.message}`;
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'undefined') {
            return 'undefined';
        }

        if (typeof value === 'function') {
            return `[Function ${value.name || 'anonymous'}]`;
        }

        try {
            return JSON.stringify(value, null, 2);
        } catch (error) {
            return String(value);
        }
    }

    queueAdminNotification(logEntry) {
        if ((!this.dmRecipientId && !this.errorChannelId) || !logEntry) {
            return;
        }

        this.notificationQueue.push({
            ...logEntry,
            timestamp: logEntry.timestamp || new Date().toISOString()
        });

        this.processNotificationQueue().catch((error) => {
            this.writeInternalError('Failed to process error notification queue:', error);
        });
    }

    async processNotificationQueue() {
        if (this.isSendingNotification || (!this.dmRecipientId && !this.errorChannelId)) {
            return;
        }

        if (!this.client || !this.client.isReady || !this.client.isReady()) {
            return;
        }

        this.isSendingNotification = true;

        try {
            const recipient = this.dmRecipientId
                ? await this.client.users.fetch(this.dmRecipientId).catch(() => null)
                : null;

            const errorChannel = this.errorChannelId
                ? await this.client.channels.fetch(this.errorChannelId).catch(() => null)
                : null;

            while (this.notificationQueue.length > 0) {
                const logEntry = this.notificationQueue.shift();
                const embed = this.buildNotificationEmbed(logEntry);
                if (recipient) await recipient.send({ embeds: [embed] }).catch(() => {});
                if (errorChannel?.isTextBased?.()) await errorChannel.send({ embeds: [embed] }).catch(() => {});
            }
        } catch (error) {
            this.writeInternalError('Failed to send error notification:', error);
        } finally {
            this.isSendingNotification = false;
        }
    }

    buildNotificationEmbed(logEntry) {
        const message = (logEntry.message || 'Unknown error').slice(0, 1024);
        const detailsSource = logEntry.stack || logEntry.message || 'No additional details';
        const details = detailsSource.length > 1000
            ? `${detailsSource.slice(0, 997)}...`
            : detailsSource;
        const context = this.formatContext(logEntry.context);

        const embed = new EmbedBuilder()
            .setColor('#ff4d4f')
            .setTitle(`🚨 ${logEntry.type || 'ERROR'}`)
            .addFields(
                { name: 'Time', value: `<t:${Math.floor(new Date(logEntry.timestamp).getTime() / 1000)}:F>`, inline: false },
                { name: 'Message', value: this.wrapCodeBlock(message), inline: false },
                { name: 'Details', value: this.wrapCodeBlock(details), inline: false }
            )
            .setTimestamp(new Date(logEntry.timestamp || Date.now()));

        if (context) {
            embed.addFields({ name: 'Context', value: this.wrapCodeBlock(context), inline: false });
        }

        return embed;
    }

    formatContext(context = {}) {
        if (!context || typeof context !== 'object' || Array.isArray(context)) {
            return '';
        }

        const entries = Object.entries(context)
            .filter(([, value]) => typeof value !== 'undefined')
            .map(([key, value]) => `${key}: ${this.normalizeErrorValue(value)}`);

        return entries.join('\n').slice(0, 1000);
    }

    wrapCodeBlock(value) {
        const safeValue = String(value || 'No data').replace(/```/g, 'ʼʼʼ');
        return `\`\`\`${safeValue.slice(0, 1000)}\`\`\``;
    }

    writeInternalError(...args) {
        const message = args
            .map((arg) => this.normalizeErrorValue(arg))
            .filter(Boolean)
            .join(' ');

        process.stderr.write(`${message}\n`);
    }

    getErrorLogs(days = 1) {
        const logs = [];
        const date = new Date();
        
        for (let i = 0; i < days; i++) {
            const dateStr = new Date(date.getTime() - i * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            const logFile = path.join(this.logDirectory, `error-${dateStr}.json`);

            if (fs.existsSync(logFile)) {
                try {
                    const content = JSON.parse(fs.readFileSync(logFile, 'utf8'));
                    logs.push(...content);
                } catch (e) {
                    this.writeInternalError(`Failed to read log file ${logFile}:`, e);
                }
            }
        }

        return logs;
    }

    clearOldLogs(daysToKeep = 30) {
        const now = Date.now();
        const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

        try {
            const files = fs.readdirSync(this.logDirectory);
            files.forEach(file => {
                const filePath = path.join(this.logDirectory, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (e) {
            this.writeInternalError('Failed to clear old logs:', e);
        }
    }
}

module.exports = ErrorHandler;
