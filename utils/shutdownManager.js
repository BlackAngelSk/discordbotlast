const fs = require('fs');
const path = require('path');

class ShutdownManager {
    constructor(client) {
        this.client = client;
        this.isShuttingDown = false;
        this.shutdownHandlers = [];
        this.setupSignalHandlers();
    }

    /**
     * Register a handler to be called during shutdown
     * @param {function} handler - Async function to call during shutdown
     */
    onShutdown(handler) {
        if (typeof handler === 'function') {
            this.shutdownHandlers.push(handler);
        }
    }

    setupSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];

        signals.forEach(signal => {
            process.on(signal, () => {
                if (!this.isShuttingDown) {
                    console.log(`\n[SHUTDOWN] Received ${signal}, initiating graceful shutdown...`);
                    this.shutdown();
                }
            });
        });
    }

    /**
     * Execute graceful shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        try {
            console.log('[SHUTDOWN] Starting graceful shutdown sequence...');

            // Execute registered handlers
            for (const handler of this.shutdownHandlers) {
                try {
                    await handler();
                } catch (error) {
                    console.error('[SHUTDOWN] Error in shutdown handler:', error);
                }
            }

            // Save critical data
            await this.saveAllData();

            // Destroy the Discord client
            if (this.client) {
                console.log('[SHUTDOWN] Disconnecting from Discord...');
                this.client.destroy();
            }

            console.log('[SHUTDOWN] Graceful shutdown completed successfully');
            process.exit(0);
        } catch (error) {
            console.error('[SHUTDOWN] Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Save all data files before shutdown
     */
    async saveAllData() {
        console.log('[SHUTDOWN] Saving all data...');
        const dataDir = path.join(__dirname, '../data');

        if (!fs.existsSync(dataDir)) {
            console.log('[SHUTDOWN] No data directory found, skipping data save');
            return;
        }

        try {
            const files = fs.readdirSync(dataDir);
            const backupDir = path.join(dataDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));

            // Create backup directory
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Backup all json files
            let backedUpCount = 0;
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const source = path.join(dataDir, file);
                    const dest = path.join(backupDir, file);
                    
                    try {
                        fs.copyFileSync(source, dest);
                        backedUpCount++;
                    } catch (e) {
                        console.error(`[SHUTDOWN] Failed to backup ${file}:`, e);
                    }
                }
            }

            console.log(`[SHUTDOWN] Backed up ${backedUpCount} data files`);
        } catch (error) {
            console.error('[SHUTDOWN] Error saving data:', error);
        }
    }

    /**
     * Get shutdown status
     */
    isShutdown() {
        return this.isShuttingDown;
    }

    /**
     * Force shutdown after timeout
     * @param {number} timeoutMs - Timeout in milliseconds
     */
    setShutdownTimeout(timeoutMs = 30000) {
        setTimeout(() => {
            if (this.isShuttingDown) {
                console.error('[SHUTDOWN] Graceful shutdown timeout, force closing...');
                process.exit(1);
            }
        }, timeoutMs);
    }
}

module.exports = ShutdownManager;
