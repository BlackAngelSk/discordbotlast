const fs = require('fs');
const path = require('path');

class UptimeMonitor {
    constructor(client) {
        this.client = client;
        this.startTime = Date.now();
        this.metricsFile = path.join(__dirname, '../logs/metrics.json');
        this.commandMetrics = new Map();
        this.memoryMetrics = [];
        this.responseMetrics = [];
        
        this.startMonitoring();
    }

    startMonitoring() {
        // Monitor memory every 5 minutes
        setInterval(() => this.recordMemory(), 5 * 60 * 1000);

        // Clean up old metrics every hour
        setInterval(() => this.cleanupOldMetrics(), 60 * 60 * 1000);

        // Save metrics every 10 minutes
        setInterval(() => this.saveMetrics(), 10 * 60 * 1000);
    }

    /**
     * Record command execution time
     * @param {string} commandName - Command name
     * @param {number} executionTime - Execution time in ms
     */
    recordCommandMetric(commandName, executionTime) {
        if (!this.commandMetrics.has(commandName)) {
            this.commandMetrics.set(commandName, {
                name: commandName,
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            });
        }

        const metric = this.commandMetrics.get(commandName);
        metric.count++;
        metric.totalTime += executionTime;
        metric.avgTime = metric.totalTime / metric.count;
        metric.minTime = Math.min(metric.minTime, executionTime);
        metric.maxTime = Math.max(metric.maxTime, executionTime);
    }

    /**
     * Record command error
     * @param {string} commandName - Command name
     */
    recordCommandError(commandName) {
        if (!this.commandMetrics.has(commandName)) {
            this.commandMetrics.set(commandName, {
                name: commandName,
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0
            });
        }

        const metric = this.commandMetrics.get(commandName);
        metric.errors++;
    }

    /**
     * Record API response time
     * @param {string} endpoint - API endpoint
     * @param {number} responseTime - Response time in ms
     */
    recordResponseMetric(endpoint, responseTime) {
        this.responseMetrics.push({
            timestamp: Date.now(),
            endpoint,
            responseTime
        });

        // Keep only last 1000 entries
        if (this.responseMetrics.length > 1000) {
            this.responseMetrics.shift();
        }
    }

    /**
     * Record memory usage
     */
    recordMemory() {
        const memUsage = process.memoryUsage();
        this.memoryMetrics.push({
            timestamp: Date.now(),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024)
        });

        // Keep only last 288 entries (24 hours at 5 minute intervals)
        if (this.memoryMetrics.length > 288) {
            this.memoryMetrics.shift();
        }
    }

    /**
     * Get uptime information
     * @returns {object} - Uptime stats
     */
    getUptime() {
        const now = Date.now();
        const uptimeMs = now - this.startTime;

        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

        return {
            ms: uptimeMs,
            formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
            days,
            hours,
            minutes,
            seconds
        };
    }

    /**
     * Get bot status
     * @returns {object} - Current bot status
     */
    getStatus() {
        const memUsage = process.memoryUsage();
        const uptime = this.getUptime();

        return {
            online: this.client.isReady(),
            uptime,
            latency: this.client.ws?.ping || 0,
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024),
                rss: Math.round(memUsage.rss / 1024 / 1024)
            },
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            channels: this.client.channels.cache.size,
            shard: this.client.shard ? `${this.client.shard.ids[0]} / ${this.client.shard.count}` : 'None'
        };
    }

    /**
     * Get command statistics
     * @returns {array} - Array of command metrics
     */
    getCommandStats() {
        const stats = Array.from(this.commandMetrics.values())
            .sort((a, b) => b.count - a.count);
        
        return stats;
    }

    /**
     * Get average response time
     * @param {number} minutes - Number of minutes to average
     * @returns {number} - Average response time in ms
     */
    getAverageResponseTime(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        const relevant = this.responseMetrics.filter(m => m.timestamp > cutoff);

        if (relevant.length === 0) return 0;

        const sum = relevant.reduce((acc, m) => acc + m.responseTime, 0);
        return Math.round(sum / relevant.length);
    }

    /**
     * Get memory trend
     * @returns {array} - Memory usage over time
     */
    getMemoryTrend() {
        return this.memoryMetrics.map(m => ({
            timestamp: new Date(m.timestamp),
            heapUsed: m.heapUsed,
            heapTotal: m.heapTotal
        }));
    }

    /**
     * Save metrics to file
     */
    saveMetrics() {
        try {
            const status = this.getStatus();
            const commandStats = this.getCommandStats();

            const metricsData = {
                timestamp: new Date().toISOString(),
                status,
                commandStats: commandStats.slice(0, 50), // Top 50 commands
                memoryTrend: this.memoryMetrics.slice(-12) // Last hour
            };

            fs.writeFileSync(this.metricsFile, JSON.stringify(metricsData, null, 2));
        } catch (e) {
            console.error('Failed to save metrics:', e);
        }
    }

    /**
     * Cleanup old metrics
     */
    cleanupOldMetrics() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        // Keep response metrics from last 24 hours
        this.responseMetrics = this.responseMetrics.filter(
            m => m.timestamp > oneDayAgo
        );
    }

    /**
     * Get health check
     * @returns {object} - Health check status
     */
    getHealthCheck() {
        const status = this.getStatus();
        const avgResponseTime = this.getAverageResponseTime(10);

        return {
            healthy: status.online && status.latency < 500,
            status,
            checks: {
                online: status.online,
                latencyOk: status.latency < 500,
                memoryOk: status.memory.heapUsed < (status.memory.heapTotal * 0.9),
                responseTimeOk: avgResponseTime < 5000
            },
            warnings: [
                !status.online ? 'Bot is offline' : null,
                status.latency > 500 ? `High latency: ${status.latency}ms` : null,
                status.memory.heapUsed > (status.memory.heapTotal * 0.9) ? 'High memory usage' : null,
                avgResponseTime > 5000 ? `Slow responses: ${avgResponseTime}ms` : null
            ].filter(Boolean)
        };
    }
}

module.exports = UptimeMonitor;
