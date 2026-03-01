const fs = require('fs');
const path = require('path');

class ReminderManager {
    constructor(client) {
        this.client = client;
        this.dataFile = path.join(__dirname, '../data/reminders.json');
        this.reminders = this.loadReminders();
        this.activeTimers = new Map();
        this.setupReminders();
    }

    loadReminders() {
        try {
            if (fs.existsSync(this.dataFile)) {
                return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load reminders:', e);
        }
        return {};
    }

    saveReminders() {
        try {
            const dir = path.dirname(this.dataFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataFile, JSON.stringify(this.reminders, null, 2));
        } catch (e) {
            console.error('Failed to save reminders:', e);
        }
    }

    /**
     * Create a reminder
     * @param {string} userId - User ID
     * @param {string} message - Reminder message
     * @param {number} delayMs - Delay in milliseconds
     * @returns {string} - Reminder ID
     */
    createReminder(userId, message, delayMs) {
        const reminderId = `${userId}_${Date.now()}`;

        if (!this.reminders[userId]) {
            this.reminders[userId] = [];
        }

        const reminder = {
            id: reminderId,
            message,
            createdAt: new Date().toISOString(),
            executedAt: null,
            dueAt: new Date(Date.now() + delayMs).toISOString(),
            completed: false,
            delayMs
        };

        this.reminders[userId].push(reminder);
        this.saveReminders();
        this.scheduleReminder(userId, reminder);

        return reminderId;
    }

    /**
     * Schedule a reminder
     * @param {string} userId - User ID
     * @param {object} reminder - Reminder object
     */
    scheduleReminder(userId, reminder) {
        const delay = new Date(reminder.dueAt).getTime() - Date.now();

        if (delay <= 0) {
            this.executeReminder(userId, reminder);
            return;
        }

        const timerId = setTimeout(() => {
            this.executeReminder(userId, reminder);
        }, delay);

        const key = `${userId}_${reminder.id}`;
        this.activeTimers.set(key, timerId);
    }

    /**
     * Execute a reminder
     * @param {string} userId - User ID
     * @param {object} reminder - Reminder object
     */
    async executeReminder(userId, reminder) {
        try {
            const user = await this.client.users.fetch(userId);
            
            const embed = {
                color: 0x00ff00,
                title: '⏰ Reminder',
                description: reminder.message,
                fields: [
                    {
                        name: 'Created',
                        value: new Date(reminder.createdAt).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Reminder ID',
                        value: reminder.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await user.send({ embeds: [embed] });

            // Mark as executed
            const userReminders = this.reminders[userId];
            if (userReminders) {
                const index = userReminders.findIndex(r => r.id === reminder.id);
                if (index !== -1) {
                    userReminders[index].completed = true;
                    userReminders[index].executedAt = new Date().toISOString();
                    this.saveReminders();
                }
            }

            // Clear timer
            const key = `${userId}_${reminder.id}`;
            this.activeTimers.delete(key);
        } catch (e) {
            console.error('Failed to execute reminder:', e);
        }
    }

    /**
     * Get reminders for a user
     * @param {string} userId - User ID
     * @param {boolean} includeCompleted - Include completed reminders
     * @returns {array} - User's reminders
     */
    getReminders(userId, includeCompleted = false) {
        const userReminders = this.reminders[userId] || [];

        if (includeCompleted) {
            return userReminders;
        }

        return userReminders.filter(r => !r.completed);
    }

    /**
     * Delete a reminder
     * @param {string} userId - User ID
     * @param {string} reminderId - Reminder ID
     * @returns {boolean} - Success status
     */
    deleteReminder(userId, reminderId) {
        const userReminders = this.reminders[userId];

        if (!userReminders) return false;

        const index = userReminders.findIndex(r => r.id === reminderId);
        if (index === -1) return false;

        const reminder = userReminders[index];
        
        // Clear timer
        const key = `${userId}_${reminderId}`;
        if (this.activeTimers.has(key)) {
            clearTimeout(this.activeTimers.get(key));
            this.activeTimers.delete(key);
        }

        userReminders.splice(index, 1);
        this.saveReminders();
        return true;
    }

    /**
     * Setup all pending reminders on bot start
     */
    setupReminders() {
        for (const [userId, userReminders] of Object.entries(this.reminders)) {
            for (const reminder of userReminders) {
                if (!reminder.completed) {
                    this.scheduleReminder(userId, reminder);
                }
            }
        }
    }

    /**
     * Get reminder statistics
     * @returns {object} - Statistics
     */
    getStats() {
        let totalReminders = 0;
        let completedReminders = 0;
        let pendingReminders = 0;
        let uniqueUsers = 0;

        for (const userReminders of Object.values(this.reminders)) {
            totalReminders += userReminders.length;
            uniqueUsers++;

            for (const reminder of userReminders) {
                if (reminder.completed) {
                    completedReminders++;
                } else {
                    pendingReminders++;
                }
            }
        }

        return {
            totalReminders,
            completedReminders,
            pendingReminders,
            uniqueUsers,
            activeTimers: this.activeTimers.size
        };
    }
}

module.exports = ReminderManager;
