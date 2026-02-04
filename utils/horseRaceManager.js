const fs = require('fs').promises;
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'horseRaces.json');

class HorseRaceManager {
    constructor() {
        this.records = [];
        this.loaded = false;
    }

    async init() {
        if (this.loaded) return;
        try {
            const dir = path.dirname(FILE);
            await fs.mkdir(dir, { recursive: true });
            const data = await fs.readFile(FILE, 'utf8');
            this.records = JSON.parse(data || '[]');
            this.loaded = true;
        } catch (err) {
            if (err.code === 'ENOENT') {
                this.records = [];
                this.loaded = true;
            } else {
                console.error('Error loading horse race history:', err);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(FILE, JSON.stringify(this.records, null, 2));
        } catch (err) {
            console.error('Error saving horse race history:', err);
        }
    }

    async addRecord(record) {
        await this.init();
        // record: { guildId, userId, bet, payout, choice, winner, course, timestamp }
        this.records.unshift(record);
        // keep a reasonable history length
        if (this.records.length > 500) this.records.length = 500;
        await this.save();
    }

    async getRecords(guildId, limit = 10) {
        await this.init();
        return this.records.filter(r => r.guildId === guildId).slice(0, limit);
    }

    async getHorseStats(guildId, course = null) {
        await this.init();
        const stats = {};
        for (let h = 1; h <= 5; h++) {
            stats[h] = { wins: 0, losses: 0 };
        }

        this.records
            .filter(r => r.guildId === guildId && (!course || r.course === course))
            .forEach(r => {
                if (r.choice === r.winner) {
                    stats[r.winner].wins++;
                } else {
                    stats[r.choice].losses++;
                }
            });

        return stats;
    }
}

module.exports = new HorseRaceManager();
