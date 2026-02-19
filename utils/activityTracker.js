const fs = require('fs').promises;
const path = require('path');

class ActivityTracker {
    constructor() {
        this.voiceDataPath = path.join(__dirname, '..', 'data', 'voiceActivity.json');
        this.presenceDataPath = path.join(__dirname, '..', 'data', 'presenceActivity.json');
        this.voiceData = {
            sessions: {}, // guildId_userId: { totalMinutes, lastSession, streakDays }
            activeUsers: {} // userId: { startTime, guildId, voiceChannelId }
        };
        this.presenceData = {
            users: {}, // guildId_userId: { lastSeen, afkSince, isAFK }
            dailyRewards: {} // guildId_userId: timestamp of last reward
        };
    }

    async init() {
        try {
            const voiceDir = path.dirname(this.voiceDataPath);
            const presenceDir = path.dirname(this.presenceDataPath);
            await fs.mkdir(voiceDir, { recursive: true });
            await fs.mkdir(presenceDir, { recursive: true });

            try {
                const voiceData = await fs.readFile(this.voiceDataPath, 'utf8');
                this.voiceData = JSON.parse(voiceData);
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('Error loading voice data:', e);
            }

            try {
                const presenceData = await fs.readFile(this.presenceDataPath, 'utf8');
                this.presenceData = JSON.parse(presenceData);
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('Error loading presence data:', e);
            }

            await this.save();
        } catch (error) {
            console.error('Error initializing activity tracker:', error);
        }
    }

    async save() {
        try {
            await fs.writeFile(this.voiceDataPath, JSON.stringify(this.voiceData, null, 2));
            await fs.writeFile(this.presenceDataPath, JSON.stringify(this.presenceData, null, 2));
        } catch (error) {
            console.error('Error saving activity data:', error);
        }
    }

    // ===== VOICE TRACKING =====
    startVoiceSession(guildId, userId, voiceChannelId) {
        const key = `${guildId}_${userId}`;
        this.voiceData.activeUsers[userId] = {
            startTime: Date.now(),
            guildId,
            voiceChannelId
        };
        return this.save();
    }

    async endVoiceSession(userId, economyManager) {
        const session = this.voiceData.activeUsers[userId];
        if (!session) return null;

        const durationMinutes = Math.floor((Date.now() - session.startTime) / 60000);
        const { guildId } = session;
        const key = `${guildId}_${userId}`;

        // Initialize user data if needed
        if (!this.voiceData.sessions[key]) {
            this.voiceData.sessions[key] = {
                totalMinutes: 0,
                lastSession: null,
                streakDays: 0
            };
        }

        // Update voice stats
        this.voiceData.sessions[key].totalMinutes += durationMinutes;
        this.voiceData.sessions[key].lastSession = new Date().toISOString();

        // Award coins (1 coin per 5 minutes, minimum 1 coin)
        const coinsEarned = Math.max(1, Math.floor(durationMinutes / 5));
        if (economyManager) {
            await economyManager.addMoney(guildId, userId, coinsEarned);
        }

        delete this.voiceData.activeUsers[userId];
        await this.save();

        return {
            durationMinutes,
            coinsEarned,
            totalMinutes: this.voiceData.sessions[key].totalMinutes
        };
    }

    getVoiceStats(guildId, userId) {
        const key = `${guildId}_${userId}`;
        return this.voiceData.sessions[key] || {
            totalMinutes: 0,
            lastSession: null,
            streakDays: 0
        };
    }

    getTopVoiceUsers(guildId, limit = 10) {
        const users = [];
        for (const [key, data] of Object.entries(this.voiceData.sessions)) {
            const [gId] = key.split('_');
            if (gId === guildId) {
                const userId = key.split('_')[1];
                users.push({ userId, ...data });
            }
        }
        return users.sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, limit);
    }

    // ===== PRESENCE TRACKING =====
    updatePresence(guildId, userId) {
        const key = `${guildId}_${userId}`;
        if (!this.presenceData.users[key]) {
            this.presenceData.users[key] = {
                lastSeen: Date.now(),
                afkSince: null,
                isAFK: false
            };
        } else {
            this.presenceData.users[key].lastSeen = Date.now();
            this.presenceData.users[key].isAFK = false;
            this.presenceData.users[key].afkSince = null;
        }
        return this.save();
    }

    markAFK(guildId, userId) {
        const key = `${guildId}_${userId}`;
        if (!this.presenceData.users[key]) {
            this.presenceData.users[key] = {
                lastSeen: Date.now(),
                afkSince: Date.now(),
                isAFK: true
            };
        } else {
            this.presenceData.users[key].isAFK = true;
            this.presenceData.users[key].afkSince = Date.now();
        }
        return this.save();
    }

    getPresenceStatus(guildId, userId) {
        const key = `${guildId}_${userId}`;
        return this.presenceData.users[key] || null;
    }

    getAFKUsers(guildId, minutesThreshold = 30) {
        const threshold = Date.now() - (minutesThreshold * 60 * 1000);
        const afkUsers = [];

        for (const [key, data] of Object.entries(this.presenceData.users)) {
            const [gId] = key.split('_');
            if (gId === guildId && data.isAFK && data.afkSince < threshold) {
                const userId = key.split('_')[1];
                afkUsers.push({
                    userId,
                    afkSince: new Date(data.afkSince),
                    minutesAFK: Math.floor((Date.now() - data.afkSince) / 60000)
                });
            }
        }

        return afkUsers.sort((a, b) => b.minutesAFK - a.minutesAFK);
    }

    async rewardActiveUser(guildId, userId, economyManager) {
        const key = `${guildId}_${userId}`;
        const lastReward = this.presenceData.dailyRewards[key];
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;

        // Check if already rewarded today
        if (lastReward && now - lastReward < dayInMs) {
            return { success: false, message: 'Already rewarded today' };
        }

        const coinsEarned = 100;
        if (economyManager) {
            await economyManager.addMoney(guildId, userId, coinsEarned);
        }

        this.presenceData.dailyRewards[key] = now;
        await this.save();

        return { success: true, coinsEarned };
    }
}

module.exports = new ActivityTracker();
