/**
 * System Stats Manager
 * Monitors CPU and RAM usage of the bot and system
 */

const os = require('os');

class SystemStatsManager {
    constructor() {
        this.cpuUsage = 0;
        this.ramUsage = 0;
        this.lastCpuCheck = process.cpuUsage();
        this.startTime = process.uptime();
    }

    /**
     * Get current CPU usage percentage
     * @returns {number} CPU usage as percentage
     */
    getCPUUsage() {
        const cpus = os.cpus();
        const avgLoad = os.loadavg()[0];
        const cpuCount = cpus.length;
        return Math.round((avgLoad / cpuCount) * 100 * 100) / 100; // 2 decimal places
    }

    /**
     * Get RAM usage information
     * @returns {Object} RAM usage details
     */
    getRAMUsage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const usagePercent = (usedMemory / totalMemory) * 100;

        return {
            used: this.formatBytes(usedMemory),
            total: this.formatBytes(totalMemory),
            free: this.formatBytes(freeMemory),
            percent: Math.round(usagePercent * 100) / 100
        };
    }

    /**
     * Get bot process memory usage
     * @returns {Object} Bot memory usage details
     */
    getBotMemoryUsage() {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: this.formatBytes(memUsage.heapUsed),
            heapTotal: this.formatBytes(memUsage.heapTotal),
            rss: this.formatBytes(memUsage.rss),
            external: this.formatBytes(memUsage.external)
        };
    }

    /**
     * Get bot uptime
     * @returns {string} Uptime formatted as string
     */
    getUptime() {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Get comprehensive system stats
     * @returns {Object} All system stats
     */
    getSystemStats() {
        return {
            cpu: this.getCPUUsage(),
            ram: this.getRAMUsage(),
            botMemory: this.getBotMemoryUsage(),
            uptime: this.getUptime(),
            timestamp: new Date()
        };
    }

    /**
     * Format bytes to human readable format
     * @private
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Get CPU usage bar visual
     * @private
     */
    getCPUBar(percentage) {
        const filled = Math.floor(percentage / 5);
        const empty = 20 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `${bar} ${percentage}%`;
    }

    /**
     * Get RAM usage bar visual
     * @private
     */
    getRAMBar(percentage) {
        const filled = Math.floor(percentage / 5);
        const empty = 20 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `${bar} ${percentage}%`;
    }

    /**
     * Get color based on usage percentage
     * @private
     */
    getHealthColor(percentage) {
        if (percentage < 25) return 0x57F287; // Green - Good
        if (percentage < 50) return 0x5865F2; // Blue - OK
        if (percentage < 75) return 0xFFD700; // Yellow - Warning
        return 0xFF6B6B; // Red - Critical
    }
}

module.exports = new SystemStatsManager();
