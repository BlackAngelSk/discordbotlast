const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ErrorHandler {
    constructor(client) {
        this.client = client;
        this.logDirectory = path.join(__dirname, '../logs');
        this.initializeLogDirectory();
        this.errorCount = 0;
        this.setupHandlers();
    }

    initializeLogDirectory() {
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
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

    shouldIgnoreWarning(warning) {
        if (!warning) return false;

        const isTimeoutNegative = warning.name === 'TimeoutNegativeWarning';
        if (!isTimeoutNegative) return false;

        const stack = typeof warning.stack === 'string' ? warning.stack : '';
        const isFromDiscordVoice = stack.includes('@discordjs/voice');

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

        // Console log
        console.error(`[${timestamp}] ${type}:`, error);

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
            console.error('Failed to write error log:', e);
        }

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
            console.error('Failed to send error embed:', e);
        }
    }

    notifyAdmin(logEntry) {
        // This would notify an admin/owner channel about critical errors
        // Implementation depends on your setup
        if (this.client.ownerIds && this.client.ownerIds.length > 0) {
            try {
                // Could send to a log channel or DM owner
            } catch (e) {
                console.error('Failed to notify admin:', e);
            }
        }
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
                    console.error(`Failed to read log file ${logFile}:`, e);
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
            console.error('Failed to clear old logs:', e);
        }
    }
}

module.exports = ErrorHandler;
