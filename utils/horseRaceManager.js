const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const economyManager = require('./economyManager');

const FILE = path.join(__dirname, '..', 'data', 'horseRaces.json');

class HorseRaceManager {
    constructor() {
        this.records = [];
        this.loaded = false;
        this.activeRaces = new Map();
        this.horses = [
            { key: 'thunder', name: '🐴 Thunder' },
            { key: 'lightning', name: '🐎 Lightning' },
            { key: 'storm', name: '🏇 Storm' },
            { key: 'spirit', name: '🦄 Spirit' }
        ];
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
        if (this.records.length > 5000) this.records.length = 5000;
        await this.save();
    }

    async addRecords(records) {
        await this.init();
        for (let i = records.length - 1; i >= 0; i--) {
            this.records.unshift(records[i]);
        }
        if (this.records.length > 5000) this.records.length = 5000;
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

    getRaceKey(guildId, channelId) {
        return `${guildId}:${channelId}`;
    }

    async createRace(guildId, channelId, userId, buyin) {
        const key = this.getRaceKey(guildId, channelId);
        if (this.activeRaces.has(key)) {
            return { success: false, message: 'A horse race is already active in this channel.' };
        }

        if (!buyin || buyin < 10) {
            return { success: false, message: 'Buy-in must be at least 10 coins.' };
        }

        this.activeRaces.set(key, {
            guildId,
            channelId,
            creatorId: userId,
            buyin,
            participants: [],
            started: false,
            createdAt: Date.now()
        });

        return { success: true };
    }

    async joinRace(guildId, channelId, userId, horseKey) {
        const key = this.getRaceKey(guildId, channelId);
        const race = this.activeRaces.get(key);
        if (!race) {
            return { success: false, message: 'No active horse race in this channel.' };
        }

        if (race.started) {
            return { success: false, message: 'That race has already started.' };
        }

        const horse = this.horses.find(h => h.key === horseKey);
        if (!horse) {
            return { success: false, message: 'Invalid horse selection.' };
        }

        if (race.participants.some(p => p.userId === userId)) {
            return { success: false, message: 'You have already joined this race.' };
        }

        const userData = economyManager.getUserData(guildId, userId);
        if (userData.balance < race.buyin) {
            return { success: false, message: `You don't have enough coins. Your balance: ${userData.balance} coins.` };
        }

        await economyManager.removeMoney(guildId, userId, race.buyin);
        race.participants.push({ userId, horse: horse.key });
        return { success: true };
    }

    async cancelRace(guildId, channelId, userId) {
        const key = this.getRaceKey(guildId, channelId);
        const race = this.activeRaces.get(key);
        if (!race) {
            return { success: false, message: 'No active horse race in this channel.' };
        }

        if (race.creatorId !== userId) {
            return { success: false, message: 'Only the race creator can cancel this race.' };
        }

        if (race.started) {
            return { success: false, message: 'That race has already started and cannot be cancelled.' };
        }

        for (const participant of race.participants) {
            await economyManager.addMoney(guildId, participant.userId, race.buyin);
        }

        this.activeRaces.delete(key);
        return { success: true };
    }

    async startRace(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const key = this.getRaceKey(guildId, channelId);
        const race = this.activeRaces.get(key);

        if (!race) {
            return interaction.reply({ content: '❌ No active horse race in this channel.', ephemeral: true });
        }

        if (race.creatorId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Only the race creator can start this race.', ephemeral: true });
        }

        if (race.started) {
            return interaction.reply({ content: '❌ That race has already started.', ephemeral: true });
        }

        if (race.participants.length < 2) {
            return interaction.reply({ content: '❌ At least 2 participants are required to start the race.', ephemeral: true });
        }

        race.started = true;

        const loadingEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🏁 The race is starting...')
            .setDescription(`Participants: **${race.participants.length}**\nBuy-in: **${race.buyin} coins**`);

        await interaction.reply({ embeds: [loadingEmbed] });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const winner = this.horses[Math.floor(Math.random() * this.horses.length)];
        const winners = race.participants.filter(p => p.horse === winner.key);
        const totalPot = race.participants.length * race.buyin;
        const payout = winners.length ? Math.floor(totalPot / winners.length) : 0;

        for (const participant of winners) {
            await economyManager.addMoney(guildId, participant.userId, payout);
        }

        const participantsText = race.participants
            .map(p => `<@${p.userId}> → ${this.horses.find(h => h.key === p.horse)?.name || p.horse}`)
            .join('\n');

        const resultsEmbed = new EmbedBuilder()
            .setColor(winners.length ? 0x57f287 : 0xed4245)
            .setTitle('🏇 Horse Race Results')
            .setDescription(`Winner: **${winner.name}**\nTotal Pot: **${totalPot} coins**`)
            .addFields(
                { name: 'Participants', value: participantsText || 'No participants', inline: false },
                { name: 'Winners', value: winners.length ? winners.map(w => `<@${w.userId}>`).join(', ') : 'No winners', inline: false },
                { name: 'Payout (each)', value: winners.length ? `${payout} coins` : '0 coins', inline: true }
            );

        await interaction.editReply({ embeds: [resultsEmbed] });

        this.activeRaces.delete(key);
    }
}

module.exports = new HorseRaceManager();
