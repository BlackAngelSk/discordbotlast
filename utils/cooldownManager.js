class CooldownManager {
    constructor() {
        this.cooldowns = new Map();
        this.globalCooldowns = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
    }

    /**
     * Check if a user is on cooldown for a command
     * @param {string} userId - The user ID
     * @param {string} commandName - The command name
     * @returns {number} - Remaining cooldown in ms, 0 if no cooldown
     */
    getRemainingCooldown(userId, commandName) {
        const key = `${userId}_${commandName}`;
        if (!this.cooldowns.has(key)) return 0;

        const { expiresAt } = this.cooldowns.get(key);
        const remaining = expiresAt - Date.now();
        
        if (remaining <= 0) {
            this.cooldowns.delete(key);
            return 0;
        }

        return remaining;
    }

    /**
     * Set a cooldown for a user on a command
     * @param {string} userId - The user ID
     * @param {string} commandName - The command name
     * @param {number} cooldownMs - Cooldown duration in milliseconds
     */
    setCooldown(userId, commandName, cooldownMs) {
        const key = `${userId}_${commandName}`;
        this.cooldowns.set(key, {
            userId,
            commandName,
            expiresAt: Date.now() + cooldownMs
        });
    }

    /**
     * Check if a user is on global cooldown
     * @param {string} userId - The user ID
     * @returns {number} - Remaining cooldown in ms, 0 if no cooldown
     */
    getGlobalCooldown(userId) {
        if (!this.globalCooldowns.has(userId)) return 0;

        const { expiresAt } = this.globalCooldowns.get(userId);
        const remaining = expiresAt - Date.now();

        if (remaining <= 0) {
            this.globalCooldowns.delete(userId);
            return 0;
        }

        return remaining;
    }

    /**
     * Set a global cooldown for a user
     * @param {string} userId - The user ID
     * @param {number} cooldownMs - Cooldown duration in milliseconds
     */
    setGlobalCooldown(userId, cooldownMs) {
        this.globalCooldowns.set(userId, {
            userId,
            expiresAt: Date.now() + cooldownMs
        });
    }

    /**
     * Reset cooldown for a user on a specific command
     * @param {string} userId - The user ID
     * @param {string} commandName - The command name
     */
    resetCooldown(userId, commandName) {
        const key = `${userId}_${commandName}`;
        this.cooldowns.delete(key);
    }

    /**
     * Reset all cooldowns for a user
     * @param {string} userId - The user ID
     */
    resetUserCooldowns(userId) {
        for (const [key] of this.cooldowns) {
            if (key.startsWith(userId)) {
                this.cooldowns.delete(key);
            }
        }
    }

    /**
     * Get all active cooldowns
     * @returns {object} - Object with statistics
     */
    getStats() {
        return {
            activeCooldowns: this.cooldowns.size,
            activeGlobalCooldowns: this.globalCooldowns.size,
            totalEntries: this.cooldowns.size + this.globalCooldowns.size
        };
    }

    /**
     * Clean up expired cooldowns
     */
    cleanup() {
        const now = Date.now();

        for (const [key, value] of this.cooldowns) {
            if (value.expiresAt <= now) {
                this.cooldowns.delete(key);
            }
        }

        for (const [key, value] of this.globalCooldowns) {
            if (value.expiresAt <= now) {
                this.globalCooldowns.delete(key);
            }
        }
    }

    /**
     * Destroy the manager and clear intervals
     */
    destroy() {
        clearInterval(this.cleanupInterval);
        this.cooldowns.clear();
        this.globalCooldowns.clear();
    }
}

module.exports = CooldownManager;
