class RateLimiter {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 5;
        this.windowMs = options.windowMs || 60000; // 1 minute default
        this.keyPrefix = options.keyPrefix || 'ratelimit';
        this.requests = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
    }

    /**
     * Check if a request should be allowed
     * @param {string} key - Unique identifier (usually userId or userId_commandName)
     * @returns {object} - { allowed: boolean, remaining: number, resetTime: number }
     */
    checkLimit(key) {
        const now = Date.now();
        const fullKey = `${this.keyPrefix}_${key}`;

        if (!this.requests.has(fullKey)) {
            this.requests.set(fullKey, {
                count: 1,
                resetTime: now + this.windowMs,
                firstRequest: now
            });
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetTime: now + this.windowMs,
                retryAfter: 0
            };
        }

        const data = this.requests.get(fullKey);

        // Reset if window has passed
        if (now > data.resetTime) {
            data.count = 1;
            data.resetTime = now + this.windowMs;
            data.firstRequest = now;
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetTime: data.resetTime,
                retryAfter: 0
            };
        }

        data.count++;

        return {
            allowed: data.count <= this.maxRequests,
            remaining: Math.max(0, this.maxRequests - data.count),
            resetTime: data.resetTime,
            retryAfter: data.resetTime - now
        };
    }

    /**
     * Manually reset a key
     * @param {string} key - The key to reset
     */
    reset(key) {
        const fullKey = `${this.keyPrefix}_${key}`;
        this.requests.delete(fullKey);
    }

    /**
     * Get current stats for a key
     * @param {string} key - The key to check
     * @returns {object} - Current request stats
     */
    getStats(key) {
        const fullKey = `${this.keyPrefix}_${key}`;
        if (!this.requests.has(fullKey)) {
            return { count: 0, resetTime: Date.now() };
        }
        return this.requests.get(fullKey);
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, data] of this.requests) {
            if (now > data.resetTime) {
                this.requests.delete(key);
            }
        }
    }

    /**
     * Get overall statistics
     */
    getOverallStats() {
        return {
            activeKeys: this.requests.size,
            maxRequests: this.maxRequests,
            windowMs: this.windowMs
        };
    }

    /**
     * Destroy the rate limiter
     */
    destroy() {
        clearInterval(this.cleanupInterval);
        this.requests.clear();
    }
}

module.exports = RateLimiter;
