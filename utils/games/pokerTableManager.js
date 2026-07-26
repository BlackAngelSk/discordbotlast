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
    this.originalBuyIn = initialChips;
    this.hasActedThisRound = false;
  }

  reset() {
    this.hole = [];
    this.bet = 0;
    this.totalBet = 0;
    this.folded = false;
    this.allIn = false;
    this.hasActedThisRound = false;
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
    this.sidePots = []; // Calculated at showdown
    this.currentBet = minBet;
    this.currentPlayerIndex = 0;
    this.gameStarted = false;
    this.gamePhase = 'waiting'; // waiting, preflop, flop, turn, river, showdown
    this.lastActivityTime = Date.now();
    this.buttonPosition = -1; // Will be 0 on first hand
    this.actionCounter = 0;
    this.hostId = null;

    // Raise tracking for minimum raise enforcement
    this.lastRaiseAmount = minBet; // The size of the last raise
    this.lastAggressorId = null;

    // Optional game settings
    this.anteEnabled = false;
    this.anteAmount = 0;

    // Stats
    this.handsPlayed = 0;
  }

  addPlayer(userId, username, chips) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    if (this.gameStarted) {
      return false;
    }
    if (this.players.has(userId)) {
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
    return this.getAllPlayers().filter((p) => !p.folded);
  }

  getActionablePlayers() {
    return this.getActivePlayers().filter((p) => !p.allIn);
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
    this.handsPlayed++;
    this.setupGame();
    return true;
  }

  setupGame() {
    this.deck = this.createDeck();
    this.community = [];
    this.pot = 0;
    this.sidePots = [];
    this.lastRaiseAmount = this.minBet;
    this.lastAggressorId = null;

    const players = this.getAllPlayers();
    const playerCount = players.length;

    // Rotate button
    this.buttonPosition = (this.buttonPosition + 1) % playerCount;

    players.forEach((p, i) => {
      p.reset();
      p.isButton = false;
      p.isSmallBlind = false;
      p.isBigBlind = false;
    });

    players[this.buttonPosition].isButton = true;

    // Heads-up (2 players): button = small blind, other = big blind
    if (playerCount === 2) {
      players[this.buttonPosition].isSmallBlind = true;
      players[(this.buttonPosition + 1) % playerCount].isBigBlind = true;
    } else {
      players[(this.buttonPosition + 1) % playerCount].isSmallBlind = true;
      players[(this.buttonPosition + 2) % playerCount].isBigBlind = true;
    }

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      players.forEach((p) => {
        p.hole.push(this.deck.pop());
      });
    }

    // Post blinds
    const smallBlindPlayer = players.find((p) => p.isSmallBlind);
    const bigBlindPlayer = players.find((p) => p.isBigBlind);

    const smallBlindAmount = Math.min(Math.floor(this.minBet / 2), smallBlindPlayer.chips);
    smallBlindPlayer.chips -= smallBlindAmount;
    smallBlindPlayer.bet = smallBlindAmount;
    smallBlindPlayer.totalBet = smallBlindAmount;
    this.pot += smallBlindAmount;

    const bigBlindAmount = Math.min(this.minBet, bigBlindPlayer.chips);
    bigBlindPlayer.chips -= bigBlindAmount;
    bigBlindPlayer.bet = bigBlindAmount;
    bigBlindPlayer.totalBet = bigBlindAmount;
    this.pot += bigBlindAmount;

    if (smallBlindPlayer.chips === 0) smallBlindPlayer.allIn = true;
    if (bigBlindPlayer.chips === 0) bigBlindPlayer.allIn = true;

    this.currentBet = bigBlindAmount;
    this.lastRaiseAmount = bigBlindAmount;

    // Post ante if enabled
    if (this.anteEnabled && this.anteAmount > 0) {
      for (const p of players) {
        const ante = Math.min(this.anteAmount, p.chips);
        p.chips -= ante;
        p.totalBet += ante;
        this.pot += ante;
      }
    }

    // Set current player: heads-up = button (SB), otherwise first player after BB
    if (playerCount === 2) {
      // Heads-up: button/SB acts first preflop
      this.currentPlayerIndex = this.buttonPosition;
    } else {
      this.currentPlayerIndex = (this.buttonPosition + 3) % playerCount;
    }

    // Skip players who are all-in
    this._skipAllInPlayers();
  }

  createDeck() {
    return createShuffledDeck();
  }

  getCurrentPlayer() {
    const players = this.getAllPlayers();
    if (players.length === 0) return null;
    const idx = this.currentPlayerIndex % players.length;
    return players[idx];
  }

  /**
   * Skip to the next player who can act (not folded, not all-in).
   * Returns false if no actionable players remain (or only one).
   */
  _skipAllInPlayers() {
    const players = this.getAllPlayers();
    if (players.length === 0) return false;

    let attempts = 0;
    while (attempts < players.length) {
      const current = this.getCurrentPlayer();
      if (current && !current.folded && !current.allIn) {
        return true;
      }
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % players.length;
      attempts++;
    }
    return false;
  }

  nextPlayer() {
    const players = this.getAllPlayers();
    if (players.length === 0) return;

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % players.length;
    this._skipAllInPlayers();
    this.lastActivityTime = Date.now();
  }

  /**
   * Calculate the minimum raise amount.
   * In standard poker, a raise must be at least the size of the previous raise.
   */
  getMinRaise() {
    return Math.max(this.currentBet + this.lastRaiseAmount, this.minBet);
  }

  playerBet(userId, amount) {
    const player = this.getPlayer(userId);
    if (!player || player.folded) return false;

    amount = Math.min(amount, player.chips);
    if (amount <= 0) return false;

    const previousBet = player.bet;
    player.chips -= amount;
    player.bet += amount;
    player.totalBet += amount;
    this.pot += amount;

    const newBetTotal = player.bet;
    if (newBetTotal > this.currentBet) {
      const raiseSize = newBetTotal - this.currentBet;
      this.lastRaiseAmount = raiseSize;
      this.lastAggressorId = userId;
      this.currentBet = newBetTotal;
    }

    if (player.chips === 0) {
      player.allIn = true;
    }

    this.actionCounter++;
    return true;
  }

  playerFold(userId) {
    const player = this.getPlayer(userId);
    if (!player || player.folded) return false;
    player.folded = true;
    this.actionCounter++;
    return true;
  }

  playerCall(userId) {
    const player = this.getPlayer(userId);
    if (!player || player.folded || player.allIn) return false;

    const amount = this.currentBet - player.bet;
    if (amount <= 0) return false;
    return this.playerBet(userId, amount);
  }

  playerCheck(userId) {
    const player = this.getPlayer(userId);
    if (!player || player.folded || player.allIn) return false;
    if (player.bet !== this.currentBet) return false;
    player.hasActedThisRound = true;
    this.actionCounter++;
    return true;
  }

  dealFlop() {
    if (this.deck.length < 3) return false;
    this.deck.pop(); // Burn card
    this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    this.gamePhase = 'flop';
    this.resetBetting();
    return true;
  }

  dealTurn() {
    if (this.deck.length < 2) return false;
    this.deck.pop(); // Burn card
    this.community.push(this.deck.pop());
    this.gamePhase = 'turn';
    this.resetBetting();
    return true;
  }

  dealRiver() {
    if (this.deck.length < 2) return false;
    this.deck.pop(); // Burn card
    this.community.push(this.deck.pop());
    this.gamePhase = 'river';
    this.resetBetting();
    return true;
  }

  resetBetting() {
    const activePlayers = this.getAllPlayers();
    activePlayers.forEach((p) => {
      if (!p.folded) {
        p.bet = 0;
        p.hasActedThisRound = false;
      }
    });
    this.currentBet = 0;
    this.lastRaiseAmount = this.minBet;
    this.lastAggressorId = null;

    // Post-flop: first to act is first active player after button
    const playerCount = activePlayers.length;
    this.currentPlayerIndex = (this.buttonPosition + 1) % playerCount;

    // Skip folded and all-in players
    this._skipAllInPlayers();
  }

  isRoundComplete() {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) return true;

    const actionable = this.getActionablePlayers();
    if (actionable.length <= 1) return true;

    // All actionable players must have acted and have matching bets
    return actionable.every((p) => (p.hasActedThisRound || p.bet === this.currentBet) && !p.allIn);
  }

  /**
   * Calculate side pots at showdown.
   * Returns an array of { amount, eligiblePlayers[] } objects.
   */
  calculatePots() {
    const allPlayers = this.getAllPlayers();

    // Collect total bets per player
    const contributions = [];
    for (const p of allPlayers) {
      if (p.totalBet > 0) {
        contributions.push({ userId: p.userId, amount: p.totalBet });
      }
    }

    // Sort by contribution ascending
    contributions.sort((a, b) => a.amount - b.amount);

    const pots = [];
    let processedAmount = 0;

    for (let i = 0; i < contributions.length; i++) {
      const currentAmount = contributions[i].amount;
      if (currentAmount === processedAmount) continue;

      const levelBet = currentAmount - processedAmount;
      const eligibleCount = contributions.length - i;

      const potAmount = levelBet * eligibleCount;

      // Find all eligible players (those who bet at least this level and haven't folded)
      const eligiblePlayers = allPlayers
        .filter((p) => p.totalBet >= currentAmount && !p.folded)
        .map((p) => p.userId);

      if (potAmount > 0 && eligiblePlayers.length > 0) {
        pots.push({ amount: potAmount, eligiblePlayers });
      }

      processedAmount = currentAmount;
    }

    // Add any leftover from rounding or odd chips to the main pot
    const totalCalculated = pots.reduce((sum, p) => sum + p.amount, 0);
    const difference = this.pot - totalCalculated;
    if (difference > 0 && pots.length > 0) {
      pots[0].amount += difference;
    }

    return pots;
  }

  getWinner() {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 1) {
      return activePlayers[0];
    }
    return null;
  }

  /**
   * Reset the table for a new hand without closing it.
   */
  resetForNewHand() {
    this.community = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = this.minBet;
    this.lastRaiseAmount = this.minBet;
    this.lastAggressorId = null;
    this.gameStarted = false;
    this.gamePhase = 'waiting';

    // Remove busted players (0 chips)
    const bustedPlayers = [];
    for (const [userId, player] of this.players) {
      if (player.chips <= 0) {
        bustedPlayers.push(userId);
      }
    }
    for (const userId of bustedPlayers) {
      this.players.delete(userId);
    }

    // Reset remaining players
    for (const player of this.players.values()) {
      player.reset();
    }
  }

  end() {
    this.gameStarted = false;
    this.gamePhase = 'waiting';
    this.community = [];
    this.deck = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = this.minBet;
    this.lastRaiseAmount = this.minBet;
    this.lastAggressorId = null;
    this.actionCounter = 0;
  }
}

class PokerTableManager {
  constructor() {
    this.tables = new Map(); // tableId -> PokerTable
    this.userTables = new Map(); // userId -> tableId

    // Cooldown tracking: userId -> timestamp of last table creation
    this.createCooldowns = new Map();
    this.COOLDOWN_MS = 30_000; // 30 seconds between table creations
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

    table.getAllPlayers().forEach((p) => {
      this.userTables.delete(p.userId);
    });

    this.tables.delete(tableId);
    return true;
  }

  /**
   * Check if a user is on cooldown for creating tables.
   * Returns remaining cooldown ms, or 0 if not on cooldown.
   */
  getCreateCooldown(userId) {
    const lastCreated = this.createCooldowns.get(userId);
    if (!lastCreated) return 0;
    const remaining = this.COOLDOWN_MS - (Date.now() - lastCreated);
    return remaining > 0 ? remaining : 0;
  }

  setCreateCooldown(userId) {
    this.createCooldowns.set(userId, Date.now());
  }

  cleanupInactiveTables(inactivityTimeout = 10 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    for (const [tableId, table] of this.tables) {
      if (now - table.lastActivityTime > inactivityTimeout) {
        table.getAllPlayers().forEach((p) => {
          this.userTables.delete(p.userId);
        });
        toDelete.push(tableId);
      }
    }

    toDelete.forEach((tableId) => this.tables.delete(tableId));
    return toDelete.length;
  }
}

const pokerTableManager = new PokerTableManager();
module.exports = { PokerTableManager: pokerTableManager, PokerTable, PokerPlayer };
