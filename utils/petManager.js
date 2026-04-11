/**
 * Pet Manager — virtual pet system
 * Pets can be adopted, fed, played with, and levelled up.
 */
const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'pets.json');

const PET_TYPES = {
    cat:    { emoji: '🐱', name: 'Cat',    hungerDrain: 1,   happinessDrain: 1.5 },
    dog:    { emoji: '🐶', name: 'Dog',    hungerDrain: 1.5, happinessDrain: 1   },
    dragon: { emoji: '🐉', name: 'Dragon', hungerDrain: 2,   happinessDrain: 2   },
    bunny:  { emoji: '🐰', name: 'Bunny',  hungerDrain: 0.8, happinessDrain: 0.8 },
    fox:    { emoji: '🦊', name: 'Fox',    hungerDrain: 1.2, happinessDrain: 1.2 },
};

const FEED_COST = 50;
const PLAY_COOLDOWN = 30 * 60 * 1000; // 30 min
const HUNGER_INTERVAL = 60 * 60 * 1000; // 1 hr

class PetManager {
    constructor() {
        this.data = {}; // { 'guildId_userId': petObject }
    }

    async init() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    key(guildId, userId) { return `${guildId}_${userId}`; }

    getPet(guildId, userId) {
        const k = this.key(guildId, userId);
        const pet = this.data[k];
        if (!pet) return null;
        // Drain stats based on elapsed time
        const now = Date.now();
        const elapsed = (now - (pet.lastUpdate || now)) / HUNGER_INTERVAL;
        const type = PET_TYPES[pet.type] || PET_TYPES.cat;
        pet.hunger = Math.max(0, pet.hunger - elapsed * type.hungerDrain * 10);
        pet.happiness = Math.max(0, pet.happiness - elapsed * type.happinessDrain * 8);
        pet.lastUpdate = now;
        return pet;
    }

    async adopt(guildId, userId, type, name) {
        type = type.toLowerCase();
        if (!PET_TYPES[type]) throw new Error('Unknown pet type');
        const k = this.key(guildId, userId);
        if (this.data[k]) throw new Error('Already has a pet');
        this.data[k] = {
            type,
            name: name || PET_TYPES[type].name,
            hunger: 100,
            happiness: 100,
            xp: 0,
            level: 1,
            lastFed: null,
            lastPlayed: null,
            lastUpdate: Date.now(),
        };
        await this.save();
        return this.data[k];
    }

    async release(guildId, userId) {
        const k = this.key(guildId, userId);
        if (!this.data[k]) return false;
        delete this.data[k];
        await this.save();
        return true;
    }

    async feed(guildId, userId) {
        const pet = this.getPet(guildId, userId);
        if (!pet) throw new Error('No pet');
        if (pet.hunger >= 100) return { alreadyFull: true };
        pet.hunger = Math.min(100, pet.hunger + 30);
        pet.xp += 5;
        pet.level = Math.floor(pet.xp / 100) + 1;
        pet.lastFed = Date.now();
        pet.lastUpdate = Date.now();
        await this.save();
        return { pet, feedCost: FEED_COST };
    }

    async play(guildId, userId) {
        const pet = this.getPet(guildId, userId);
        if (!pet) throw new Error('No pet');
        const now = Date.now();
        if (pet.lastPlayed && (now - pet.lastPlayed) < PLAY_COOLDOWN) {
            return { cooldown: true, remaining: PLAY_COOLDOWN - (now - pet.lastPlayed) };
        }
        pet.happiness = Math.min(100, pet.happiness + 25);
        pet.xp += 10;
        pet.level = Math.floor(pet.xp / 100) + 1;
        pet.lastPlayed = now;
        pet.lastUpdate = now;
        await this.save();
        return { pet, cooldown: false };
    }

    getTypeInfo(type) { return PET_TYPES[type] || null; }
    getTypes() { return PET_TYPES; }
}

module.exports = new PetManager();
