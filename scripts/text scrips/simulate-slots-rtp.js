const GRID_SIZE = 5;
const FREE_SPIN_SYMBOL = '🌀';
const FREE_SPIN_TRIGGER_COUNT = 3;
const BASE_FREE_SPINS = 3;
const MAX_TOTAL_SPINS = 25;
const BASE_PAYOUT_MULTIPLIERS = {
    default: { 3: 1.08, 4: 2.16, 5: 4.32 },
    '🔔': { 3: 1.62, 4: 3.78, 5: 7.4 },
    '⭐': { 3: 3.38, 4: 8.78, 5: 18.9 },
    '💎': { 3: 6.75, 4: 16.2, 5: 40.5 }
};

function buildPayoutMultipliers(scale = 1) {
    const scaled = {};
    for (const [symbol, table] of Object.entries(BASE_PAYOUT_MULTIPLIERS)) {
        scaled[symbol] = {};
        for (const [count, value] of Object.entries(table)) {
            scaled[symbol][count] = value * scale;
        }
    }
    return scaled;
}

function createSlotSymbols(freeSpinWeight = 2.4) {
    return [
        { icon: '🍎', weight: 24 },
        { icon: '🍊', weight: 21 },
        { icon: '🍋', weight: 19 },
        { icon: '🍌', weight: 16 },
        { icon: '🍇', weight: 12 },
        { icon: '🔔', weight: 6 },
        { icon: '⭐', weight: 1.7 },
        { icon: '💎', weight: 0.9 },
        { icon: FREE_SPIN_SYMBOL, weight: freeSpinWeight }
    ];
}

const PAYLINES = [
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
    [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]],
    [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
    [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]],
    [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]],
    [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]],
    [[1, 0], [0, 1], [1, 2], [2, 3], [1, 4]],
    [[3, 0], [4, 1], [3, 2], [2, 3], [3, 4]],
    [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]],
    [[4, 0], [3, 1], [4, 2], [3, 3], [4, 4]],
    [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]],
    [[4, 0], [3, 1], [2, 2], [3, 3], [4, 4]]
];

let SLOT_SYMBOLS = createSlotSymbols();
let TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((acc, symbol) => acc + symbol.weight, 0);
let PAYOUT_MULTIPLIERS = buildPayoutMultipliers(1);

function pickWeightedSymbol() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const symbol of SLOT_SYMBOLS) {
        roll -= symbol.weight;
        if (roll <= 0) return symbol.icon;
    }
    return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].icon;
}

function spinSlots() {
    const grid = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        const line = [];
        for (let col = 0; col < GRID_SIZE; col++) {
            line.push(pickWeightedSymbol());
        }
        grid.push(line);
    }
    return grid;
}

function getMultiplier(symbol, matchCount) {
    const symbolTable = PAYOUT_MULTIPLIERS[symbol] || PAYOUT_MULTIPLIERS.default;
    return symbolTable[matchCount] || 0;
}

function evaluatePayline(grid, line, bet) {
    const lineSymbols = line.map(([row, col]) => grid[row][col]);

    let baseSymbol = null;
    let matchCount = 0;

    for (const symbol of lineSymbols) {
        if (baseSymbol === null) {
            if (symbol === FREE_SPIN_SYMBOL) {
                matchCount++;
                continue;
            }
            baseSymbol = symbol;
            matchCount++;
            continue;
        }

        if (symbol === baseSymbol || symbol === FREE_SPIN_SYMBOL) {
            matchCount++;
        } else {
            break;
        }
    }

    if (!baseSymbol || matchCount < 3) return 0;
    const multiplier = getMultiplier(baseSymbol, Math.min(matchCount, 5));
    if (multiplier <= 0) return 0;
    return Math.floor(bet * multiplier);
}

function calculatePayout(grid, bet) {
    let totalPayout = 0;
    let totalWinningLines = 0;

    for (const payline of PAYLINES) {
        const payout = evaluatePayline(grid, payline, bet);
        if (payout > 0) {
            totalPayout += payout;
            totalWinningLines++;
        }
    }

    return { totalPayout, totalWinningLines };
}

function countSpecialSymbols(grid) {
    let count = 0;
    for (const row of grid) {
        for (const symbol of row) {
            if (symbol === FREE_SPIN_SYMBOL) count++;
        }
    }
    return count;
}

function calculateFreeSpins(specialCount) {
    if (specialCount < FREE_SPIN_TRIGGER_COUNT) return 0;
    const extra = Math.floor((specialCount - FREE_SPIN_TRIGGER_COUNT) / 2);
    return BASE_FREE_SPINS + Math.min(extra, 2);
}

function simulateSession(bet) {
    let totalPayout = 0;
    let spinsRemaining = 1;
    let spinsPlayed = 0;
    let freeSpinsAwarded = 0;
    let totalWinningLines = 0;

    while (spinsRemaining > 0 && spinsPlayed < MAX_TOTAL_SPINS) {
        spinsRemaining--;
        spinsPlayed++;

        const grid = spinSlots();
        const { totalPayout: spinPayout, totalWinningLines: spinWinningLines } = calculatePayout(grid, bet);
        totalPayout += spinPayout;
        totalWinningLines += spinWinningLines;

        const specialCount = countSpecialSymbols(grid);
        const awardedSpins = calculateFreeSpins(specialCount);

        const beforeAward = spinsRemaining;
        if (awardedSpins > 0 && spinsPlayed < MAX_TOTAL_SPINS) {
            spinsRemaining = Math.min(spinsRemaining + awardedSpins, MAX_TOTAL_SPINS - spinsPlayed);
            freeSpinsAwarded += Math.max(0, spinsRemaining - beforeAward);
        }
    }

    return { totalPayout, spinsPlayed, freeSpinsAwarded, totalWinningLines };
}

function run() {
    const sessions = Number.parseInt(process.argv[2] || '10000', 10);
    const bet = Number.parseInt(process.argv[3] || '100', 10);
    const freeSpinWeightArg = Number.parseFloat(process.argv[4] || '2.4');
    const payoutScaleArg = Number.parseFloat(process.argv[5] || '1');

    if (
        !Number.isInteger(sessions) || sessions <= 0 ||
        !Number.isInteger(bet) || bet <= 0 ||
        Number.isNaN(freeSpinWeightArg) || freeSpinWeightArg < 0 ||
        Number.isNaN(payoutScaleArg) || payoutScaleArg <= 0
    ) {
        console.error('Usage: node scripts/simulate-slots-rtp.js <sessions> <bet> [freeSpinWeight] [payoutScale]');
        process.exit(1);
    }

    SLOT_SYMBOLS = createSlotSymbols(freeSpinWeightArg);
    TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((acc, symbol) => acc + symbol.weight, 0);
    PAYOUT_MULTIPLIERS = buildPayoutMultipliers(payoutScaleArg);

    let totalBet = 0;
    let totalPayout = 0;
    let totalSpins = 0;
    let totalFreeSpins = 0;
    let totalWinningPaylines = 0;

    for (let i = 0; i < sessions; i++) {
        const result = simulateSession(bet);
        totalBet += bet;
        totalPayout += result.totalPayout;
        totalSpins += result.spinsPlayed;
        totalFreeSpins += result.freeSpinsAwarded;
        totalWinningPaylines += result.totalWinningLines;
    }

    const rtp = totalPayout / totalBet;

    console.log('--- Slots RTP Simulation ---');
    console.log(`Sessions: ${sessions.toLocaleString()}`);
    console.log(`Bet per session: ${bet.toLocaleString()}`);
    console.log(`Free spin symbol weight: ${freeSpinWeightArg}`);
    console.log(`Payout scale: ${payoutScaleArg}`);
    console.log(`Total bet: ${totalBet.toLocaleString()}`);
    console.log(`Total payout: ${totalPayout.toLocaleString()}`);
    console.log(`RTP: ${(rtp * 100).toFixed(2)}%`);
    console.log(`Avg spins/session: ${(totalSpins / sessions).toFixed(2)}`);
    console.log(`Avg free spins/session: ${(totalFreeSpins / sessions).toFixed(2)}`);
    console.log(`Avg winning paylines/session: ${(totalWinningPaylines / sessions).toFixed(2)}`);
}

run();
