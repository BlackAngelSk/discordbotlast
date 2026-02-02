const fs = require('fs').promises;
const path = require('path');

const STATS_FILE = path.join(__dirname, '..', 'data', 'gameStats.json');

class GameStatsManager {
    constructor() {
        this.stats = new Map(); // userId -> { blackjack: {wins, losses}, roulette: {wins, losses} }
        this.loaded = false;
    }

    async init() {
        try {
            const dataDir = path.dirname(STATS_FILE);
            await fs.mkdir(dataDir, { recursive: true });

            try {
                const data = await fs.readFile(STATS_FILE, 'utf8');
                const parsed = JSON.parse(data);
                
                for (const [userId, stats] of Object.entries(parsed)) {
                    this.stats.set(userId, stats);
                }
                
                console.log(`✅ Loaded game stats for ${this.stats.size} user(s)`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error loading game stats:', error);
                }
            }

            this.loaded = true;
        } catch (error) {
            console.error('Failed to initialize game stats manager:', error);
        }
    }

    async save() {
        try {
            const obj = {};
            for (const [userId, stats] of this.stats.entries()) {
                obj[userId] = stats;
            }
            await fs.writeFile(STATS_FILE, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error('Error saving game stats:', error);
        }
    }

    getStats(userId) {
        if (!this.stats.has(userId)) {
            this.stats.set(userId, {
                blackjack: { wins: 0, losses: 0, ties: 0 },
                roulette: { wins: 0, losses: 0 },
                slots: { wins: 0, losses: 0 },
                dice: { wins: 0, losses: 0 },
                coinflip: { wins: 0, losses: 0 },
                rps: { wins: 0, losses: 0, ties: 0 },
                ttt: { wins: 0, losses: 0, ties: 0 }
            });
        }
        
        // Ensure all game properties exist for existing users
        const stats = this.stats.get(userId);
        if (!stats.blackjack) stats.blackjack = { wins: 0, losses: 0, ties: 0 };
        if (!stats.roulette) stats.roulette = { wins: 0, losses: 0 };
        if (!stats.slots) stats.slots = { wins: 0, losses: 0 };
        if (!stats.dice) stats.dice = { wins: 0, losses: 0 };
        if (!stats.coinflip) stats.coinflip = { wins: 0, losses: 0 };
        if (!stats.rps) stats.rps = { wins: 0, losses: 0, ties: 0 };
        if (!stats.ttt) stats.ttt = { wins: 0, losses: 0, ties: 0 };
        
        return stats;
    }

    async recordBlackjack(userId, result) {
        const stats = this.getStats(userId);
        if (result === 'win') {
            stats.blackjack.wins++;
        } else if (result === 'loss') {
            stats.blackjack.losses++;
        } else if (result === 'tie') {
            stats.blackjack.ties++;
        }
        await this.save();
    }

    async recordRoulette(userId, won) {
        const stats = this.getStats(userId);
        if (won) {
            stats.roulette.wins++;
        } else {
            stats.roulette.losses++;
        }
        await this.save();
    }

    async recordSlots(userId, won) {
        const stats = this.getStats(userId);
        if (won) {
            stats.slots.wins++;
        } else {
            stats.slots.losses++;
        }
        await this.save();
    }

    async recordDice(userId, won) {
        const stats = this.getStats(userId);
        if (won) {
            stats.dice.wins++;
        } else {
            stats.dice.losses++;
        }
        await this.save();
    }

    async recordCoinflip(userId, won) {
        const stats = this.getStats(userId);
        if (won) {
            stats.coinflip.wins++;
        } else {
            stats.coinflip.losses++;
        }
        await this.save();
    }

    async recordRPS(userId, result) {
        const stats = this.getStats(userId);
        if (result === 'win') {
            stats.rps.wins++;
        } else if (result === 'loss') {
            stats.rps.losses++;
        } else if (result === 'tie') {
            stats.rps.ties++;
        }
        await this.save();
    }

    async recordTTT(userId, result) {
        const stats = this.getStats(userId);
        if (result === 'win') {
            stats.ttt.wins++;
        } else if (result === 'loss') {
            stats.ttt.losses++;
        } else if (result === 'tie') {
            stats.ttt.ties++;
        }
        await this.save();
    }

    getTotalGames(userId) {
        const stats = this.getStats(userId);
        return {
            blackjack: stats.blackjack.wins + stats.blackjack.losses + stats.blackjack.ties,
            roulette: stats.roulette.wins + stats.roulette.losses,
            slots: stats.slots.wins + stats.slots.losses,
            dice: stats.dice.wins + stats.dice.losses,
            coinflip: stats.coinflip.wins + stats.coinflip.losses,
            rps: stats.rps.wins + stats.rps.losses + stats.rps.ties,
            ttt: stats.ttt.wins + stats.ttt.losses + stats.ttt.ties
        };
    }

    getWinRate(userId, game) {
        const stats = this.getStats(userId);
        const gameStats = stats[game];
        const hasTies = game === 'blackjack' || game === 'rps' || game === 'ttt';
        const total = hasTies
            ? gameStats.wins + gameStats.losses + gameStats.ties
            : gameStats.wins + gameStats.losses;
        
        if (total === 0) return 0;
        return ((gameStats.wins / total) * 100).toFixed(1);
    }
}

const gameStatsManager = new GameStatsManager();
module.exports = gameStatsManager;
