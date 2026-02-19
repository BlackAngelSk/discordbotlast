const fs = require('fs').promises;
const path = require('path');

class BirthdayManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'birthdays.json');
        this.data = {
            birthdays: {}, // guildId_userId: { month, day, year }
            lastCelebrated: {} // guildId_userId: timestamp
        };
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading birthday data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving birthday data:', error);
        }
    }

    setBirthday(guildId, userId, month, day, year = null) {
        const key = `${guildId}_${userId}`;
        this.data.birthdays[key] = { month: parseInt(month), day: parseInt(day), year: year ? parseInt(year) : null };
        return this.save();
    }

    getBirthday(guildId, userId) {
        const key = `${guildId}_${userId}`;
        return this.data.birthdays[key] || null;
    }

    removeBirthday(guildId, userId) {
        const key = `${guildId}_${userId}`;
        delete this.data.birthdays[key];
        delete this.data.lastCelebrated[key];
        return this.save();
    }

    getTodaysBirthdays(guildId) {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();

        const birthdays = [];
        for (const [key, birthday] of Object.entries(this.data.birthdays)) {
            if (!key.startsWith(guildId)) continue;
            if (birthday.month === month && birthday.day === day) {
                const [gId, userId] = key.split('_');
                birthdays.push({ userId, birthday });
            }
        }
        return birthdays;
    }

    getAge(birthday) {
        if (!birthday.year) return null;
        const today = new Date();
        let age = today.getFullYear() - birthday.year;
        const hasHadBirthday = 
            today.getMonth() + 1 > birthday.month ||
            (today.getMonth() + 1 === birthday.month && today.getDate() >= birthday.day);
        
        if (!hasHadBirthday) age--;
        return age;
    }

    setLastCelebrated(guildId, userId) {
        const key = `${guildId}_${userId}`;
        this.data.lastCelebrated[key] = Date.now();
        return this.save();
    }

    hasBeenCelebratedToday(guildId, userId) {
        const key = `${guildId}_${userId}`;
        const lastTime = this.data.lastCelebrated[key];
        if (!lastTime) return false;

        const lastDate = new Date(lastTime);
        const today = new Date();
        
        return lastDate.toDateString() === today.toDateString();
    }

    getUpcomingBirthdays(guildId, daysAhead = 7) {
        const today = new Date();
        const upcoming = [];

        for (const [key, birthday] of Object.entries(this.data.birthdays)) {
            if (!key.startsWith(guildId)) continue;

            for (let i = 0; i <= daysAhead; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() + i);

                if (birthday.month === checkDate.getMonth() + 1 && 
                    birthday.day === checkDate.getDate()) {
                    const [gId, userId] = key.split('_');
                    const daysUntil = i;
                    upcoming.push({ userId, birthday, daysUntil });
                    break;
                }
            }
        }

        return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    }
}

module.exports = new BirthdayManager();
