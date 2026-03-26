const fs = require('fs').promises;
const path = require('path');
const { createShuffledDeck } = require('./playingCards');

class PokerPlayer {
    constructor(userId, username, initialChips) {
        this.userId = userId;
        this.username = username;
        this.chips = initialChips;
        this.hole = [];
        this.bet = 0;
        this.totalBet = 0;
        this.folded = false;
        this.allIn = false;
        this.isButton = false;
        this.isSmallBlind = false;
        this.isBigBlind = false;
    }

    reset() {
        this.hole = [];
        this.bet = 0;
        this.folded = false;
        this.allIn = false;
    }
}

class PokerTable {
    constructor(tableId, guildId, channelId, minBet = 10, maxPlayers = 6) {
        this.tableId = tableId;
        this.guildId = guildId;
        this.channelId = channelId;
        this.minBet = minBet;
        this.maxPlayers = maxPlayers;
        
        this.players = new Map(); // userId -> PokerPlayer
        this.deck = [];
        this.community = [];
        this.pot = 0;
        this.currentBet = minBet;
        this.currentPlayerIndex = 0;
        this.gameStarted = false;
        this.gamePhase = 'waiting'; // waiting, preflop, flop, turn, river, showdown
        this.lastActivityTime = Date.now();
        this.buttonPosition = 0;
        this.actionCounter = 0;
        this.hostId = null;
    }

    addPlayer(userId, username, chips) {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }
        if (this.gameStarted) {
            return false;
        }
        this.players.set(userId, new PokerPlayer(userId, username, chips));
        return true;
    }

    removePlayer(userId) {
        return this.players.delete(userId);
    }

    getPlayer(userId) {
        return this.players.get(userId);
    }

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    getActivePlayers() {
        return this.getAllPlayers().filter(p => !p.folded);
    }

    getTotalPlayers() {
        return this.players.size;
    }

    canStartGame() {
        return this.players.size >= 2 && this.players.size <= this.maxPlayers;
    }

    startGame() {
        if (!this.canStartGame()) {
            return false;
        }
        this.gameStarted = true;
        this.gamePhase = 'preflop';
        this.actionCounter = 0;
        this.setupGame();
        return true;
    }

    setupGame() {
        this.deck = this.createDeck();
        this.community = [];
        this.pot = 0;
        this.currentBet = this.minBet;

        const players = this.getAllPlayers();
        
        // Rotate button
        this.buttonPosition = (this.buttonPosition + 1) % players.length;
        players.forEach((p, i) => {
            p.reset();
            p.isButton = i === this.buttonPosition;
            p.isSmallBlind = i === (this.buttonPosition + 1) % players.length;
            p.isBigBlind = i === (this.buttonPosition + 2) % players.length;
        });

        // Deal hole cards
        for (let i = 0; i < 2; i++) {
            players.forEach(p => {
                p.hole.push(this.deck.pop());
            });
        }

        // Post blinds
        const smallBlindPlayer = players[(this.buttonPosition + 1) % players.length];
        const bigBlindPlayer = players[(this.buttonPosition + 2) % players.length];

        const smallBlindAmount = Math.floor(this.minBet / 2);
        smallBlindPlayer.chips -= smallBlindAmount;
        smallBlindPlayer.bet = smallBlindAmount;
        smallBlindPlayer.totalBet = smallBlindAmount;
        this.pot += smallBlindAmount;

        bigBlindPlayer.chips -= this.minBet;
        bigBlindPlayer.bet = this.minBet;
        bigBlindPlayer.totalBet = this.minBet;
        this.pot += this.minBet;

        this.currentBet = this.minBet;
        this.currentPlayerIndex = (this.buttonPosition + 3) % players.length;
    }

    createDeck() {
        return createShuffledDeck();
    }

    getCurrentPlayer() {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length === 0) return null;
        return activePlayers[this.currentPlayerIndex % activePlayers.length];
    }

    nextPlayer() {
        const activePlayers = this.getActivePlayers();
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % activePlayers.length;
        this.lastActivityTime = Date.now();
    }

    playerBet(userId, amount) {
        const player = this.getPlayer(userId);
        if (!player) return false;

        amount = Math.min(amount, player.chips);
        player.chips -= amount;
        player.bet += amount;
        player.totalBet += amount;
        this.pot += amount;

        if (player.bet > this.currentBet) {
            this.currentBet = player.bet;
        }

        if (player.chips === 0) {
            player.allIn = true;
        }

        return true;
    }

    playerFold(userId) {
        const player = this.getPlayer(userId);
        if (!player) return false;
        player.folded = true;
        return true;
    }

    playerCall(userId) {
        const player = this.getPlayer(userId);
        if (!player) return false;
        
        const amount = this.currentBet - player.bet;
        return this.playerBet(userId, amount);
    }

    playerCheck(userId) {
        const player = this.getPlayer(userId);
        if (!player) return false;
        if (player.bet !== this.currentBet) return false; // Can't check if there's an uncalled bet
        return true;
    }

    dealFlop() {
        this.deck.pop(); // Burn card
        this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
        this.gamePhase = 'flop';
        this.resetBetting();
    }

    dealTurn() {
        this.deck.pop(); // Burn card
        this.community.push(this.deck.pop());
        this.gamePhase = 'turn';
        this.resetBetting();
    }

    dealRiver() {
        this.deck.pop(); // Burn card
        this.community.push(this.deck.pop());
        this.gamePhase = 'river';
        this.resetBetting();
    }

    resetBetting() {
        this.getAllPlayers().forEach(p => {
            if (!p.folded) p.bet = 0;
        });
        this.currentBet = 0;
        this.currentPlayerIndex = (this.buttonPosition + 1) % this.getAllPlayers().length;
    }

    isRoundComplete() {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length <= 1) return true;

        return activePlayers.every(p => p.bet === this.currentBet || p.allIn);
    }

    getWinner() {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length === 1) {
            return activePlayers[0];
        }
        return null;
    }

    end() {
        this.gameStarted = false;
        this.gamePhase = 'waiting';
        this.community = [];
        this.deck = [];
        this.pot = 0;
        this.currentBet = this.minBet;
        this.actionCounter = 0;
    }
}

class PokerTableManager {
    constructor() {
        this.tables = new Map(); // tableId -> PokerTable
        this.userTables = new Map(); // userId -> tableId
    }

    createTable(guildId, channelId, minBet = 10, maxPlayers = 6) {
        const tableId = `poker_${guildId}_${channelId}_${Date.now()}`;
        const table = new PokerTable(tableId, guildId, channelId, minBet, maxPlayers);
        this.tables.set(tableId, table);
        return table;
    }

    getTable(tableId) {
        return this.tables.get(tableId);
    }

    getTableByChannel(guildId, channelId) {
        for (const [, table] of this.tables) {
            if (table.guildId === guildId && table.channelId === channelId && table.gameStarted) {
                return table;
            }
        }
        return null;
    }

    getUserTable(userId) {
        const tableId = this.userTables.get(userId);
        return tableId ? this.tables.get(tableId) : null;
    }

    addPlayerToTable(tableId, userId, username, chips) {
        const table = this.tables.get(tableId);
        if (!table) return false;
        
        if (table.addPlayer(userId, username, chips)) {
            this.userTables.set(userId, tableId);
            return true;
        }
        return false;
    }

    removePlayerFromTable(userId) {
        const tableId = this.userTables.get(userId);
        if (!tableId) return false;

        const table = this.tables.get(tableId);
        if (!table) return false;

        table.removePlayer(userId);
        this.userTables.delete(userId);

        if (table.getTotalPlayers() === 0) {
            this.tables.delete(tableId);
        }

        return true;
    }

    closeTable(tableId) {
        const table = this.tables.get(tableId);
        if (!table) return false;

        table.getAllPlayers().forEach(p => {
            this.userTables.delete(p.userId);
        });

        this.tables.delete(tableId);
        return true;
    }

    cleanupInactiveTables(inactivityTimeout = 5 * 60 * 1000) {
        const now = Date.now();
        const toDelete = [];

        for (const [tableId, table] of this.tables) {
            if (now - table.lastActivityTime > inactivityTimeout) {
                table.getAllPlayers().forEach(p => {
                    this.userTables.delete(p.userId);
                });
                toDelete.push(tableId);
            }
        }

        toDelete.forEach(tableId => this.tables.delete(tableId));
        return toDelete.length;
    }
}

const pokerTableManager = new PokerTableManager();
module.exports = { PokerTableManager: pokerTableManager, PokerTable, PokerPlayer };
