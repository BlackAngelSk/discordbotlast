const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

const MIN_BET = 10;
const MAX_BET = 1_000_000;
const COOLDOWN_MS = 3000;
const slotCooldowns = new Map();
const GRID_SIZE = 5;
const FREE_SPIN_SYMBOL = '🌀';
const FREE_SPIN_TRIGGER_COUNT = 3;
const BASE_FREE_SPINS = 3;
const MAX_TOTAL_SPINS = 500;
const ANIMATION_STEPS = 3;
const ANIMATION_DELAY_MS = 450;
const SPIN_REVEAL_DELAY_MS = 500;
const SKIP_BUTTON_TIMEOUT_MS = 60_000;
const SKIP_BUTTON_ID = 'slots_skip';
const EMBED_FIELD_VALUE_LIMIT = 1024;
const TARGET_RTP = 0.92;
const PAYOUT_MULTIPLIERS = {
    default: { 3: 0.8, 4: 1.6, 5: 3.2 },
    '🔔': { 3: 1.2, 4: 2.8, 5: 5.5 },
    '⭐': { 3: 2.5, 4: 6.5, 5: 14 },
    '💎': { 3: 5, 4: 12, 5: 30 }
};

const SLOT_SYMBOLS = [
    { icon: '🍎', weight: 24 },
    { icon: '🍊', weight: 21 },
    { icon: '🍋', weight: 19 },
    { icon: '🍌', weight: 16 },
    { icon: '🍇', weight: 12 },
    { icon: '🔔', weight: 6 },
    { icon: '⭐', weight: 1.7 },
    { icon: '💎', weight: 0.9 },
    { icon: FREE_SPIN_SYMBOL, weight: 0.8 }
];

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((acc, symbol) => acc + symbol.weight, 0);

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

function parseBetArg(rawArg, balance) {
    if (!rawArg) return null;
    const normalized = rawArg.toLowerCase();

    if (normalized === 'all' || normalized === 'max') {
        return Math.min(balance, MAX_BET);
    }

    const bet = Number.parseInt(rawArg, 10);
    return Number.isInteger(bet) ? bet : null;
}

module.exports = {
    name: 'slots',
    description: 'Play 5x5 slots with paylines, patterns, and free spins!',
    usage: '!slots <bet|max|all>',
    aliases: ['slot', 'slotmachine'],
    category: 'fun',
    async execute(message, args) {
        try {
            const userId = message.author.id;
            const guildId = message.guild.id;
            const now = Date.now();
            const nextAvailableAt = slotCooldowns.get(userId) || 0;

            if (now < nextAvailableAt) {
                const secondsLeft = Math.ceil((nextAvailableAt - now) / 1000);
                return message.reply(`⏳ Please wait ${secondsLeft}s before using slots again.`);
            }

            const userData = economyManager.getUserData(guildId, userId);
            const bet = parseBetArg(args[0], userData.balance);

            if (!Number.isInteger(bet)) {
                return message.reply('❌ Please provide a valid bet amount (`number`, `max`, or `all`).\nUsage: `!slots <bet|max|all>`');
            }

            if (bet < MIN_BET) {
                return message.reply(`❌ Minimum bet is ${MIN_BET} coins.\nUsage: \`!slots <bet|max|all>\``);
            }

            if (bet > MAX_BET) {
                return message.reply(`❌ Maximum bet is ${MAX_BET.toLocaleString()} coins.`);
            }

            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance.toLocaleString()} coins`);
            }

            const removed = await economyManager.removeMoney(guildId, userId, bet);
            if (!removed) {
                return message.reply('❌ Could not place your bet. Please try again.');
            }

            slotCooldowns.set(userId, now + COOLDOWN_MS);
            await playSlotsWithBet(message, bet);

        } catch (error) {
            console.error('Error in slots command:', error);
            message.reply('❌ An error occurred while playing slots!');
        }
    }
};

async function playSlotsWithBet(message, bet) {
    const pickWeightedSymbol = () => {
        let roll = Math.random() * TOTAL_WEIGHT;

        for (const symbol of SLOT_SYMBOLS) {
            roll -= symbol.weight;
            if (roll <= 0) {
                return symbol.icon;
            }
        }

        return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].icon;
    };

    const spinSlots = () => {
        const grid = [];
        for (let row = 0; row < GRID_SIZE; row++) {
            const line = [];
            for (let col = 0; col < GRID_SIZE; col++) {
                line.push(pickWeightedSymbol());
            }
            grid.push(line);
        }
        return grid;
    };

    const formatGrid = (grid) => grid.map(row => row.join(' ')).join('\n');

    const clampFieldValue = (value, fallback = '—') => {
        const normalized = typeof value === 'string' ? value : String(value ?? '');
        const safe = normalized.trim().length > 0 ? normalized : fallback;
        if (safe.length <= EMBED_FIELD_VALUE_LIMIT) return safe;
        return `${safe.slice(0, EMBED_FIELD_VALUE_LIMIT - 3)}...`;
    };

    const buildSessionSummary = (lines) => {
        if (!lines.length) return 'No wins this session.';

        let output = '';
        for (let i = 0; i < lines.length; i++) {
            const candidate = output ? `${output}\n${lines[i]}` : lines[i];
            if (candidate.length > 1024) {
                const remaining = lines.length - i;
                return `${output}\n...and ${remaining} more spin${remaining > 1 ? 's' : ''}.`;
            }
            output = candidate;
        }

        return output;
    };

    const formatWinningLines = (wins) => {
        if (!wins.length) return 'No winning patterns.';

        return wins
            .sort((a, b) => b.payout - a.payout)
            .slice(0, 5)
            .map(win => `#${win.line}: ${win.baseSymbol} x${win.matchCount} (+${win.payout.toLocaleString()})`)
            .join('\n');
    };

    const getMultiplier = (symbol, matchCount) => {
        const symbolTable = PAYOUT_MULTIPLIERS[symbol] || PAYOUT_MULTIPLIERS.default;
        return symbolTable[matchCount] || 0;
    };

    const evaluatePayline = (grid, line) => {
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

        if (!baseSymbol || matchCount < 3) {
            return null;
        }

        const multiplier = getMultiplier(baseSymbol, Math.min(matchCount, 5));
        if (multiplier <= 0) {
            return null;
        }

        const payout = Math.floor(bet * multiplier);
        return {
            baseSymbol,
            matchCount,
            payout,
            multiplier
        };
    };

    const calculatePayout = (grid) => {
        let totalPayout = 0;
        const wins = [];

        for (let index = 0; index < PAYLINES.length; index++) {
            const line = PAYLINES[index];
            const win = evaluatePayline(grid, line);
            if (!win) continue;

            totalPayout += win.payout;
            wins.push({
                line: index + 1,
                ...win
            });
        }

        return { totalPayout, wins };
    };

    const countSpecialSymbols = (grid) => {
        let count = 0;
        for (const row of grid) {
            for (const symbol of row) {
                if (symbol === FREE_SPIN_SYMBOL) count++;
            }
        }
        return count;
    };

    const calculateFreeSpins = (specialCount) => {
        if (specialCount < FREE_SPIN_TRIGGER_COUNT) return 0;
        const extra = Math.floor((specialCount - FREE_SPIN_TRIGGER_COUNT) / 2);
        return BASE_FREE_SPINS + Math.min(extra, 2);
    };

    const spinEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎰 5x5 Slots Machine')
        .setDescription(`Spinning 5x5 reels... (Bet: ${bet.toLocaleString()} coins)\n\n🎰 🎰 🎰 🎰 🎰\n🎰 🎰 🎰 🎰 🎰\n🎰 🎰 🎰 🎰 🎰\n🎰 🎰 🎰 🎰 🎰\n🎰 🎰 🎰 🎰 🎰`);

    const msg = await message.reply({ embeds: [spinEmbed] });

    const createSkipRow = (disabled = false) => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(SKIP_BUTTON_ID)
            .setLabel('Skip Spin Reveal')
            .setEmoji('⏩')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );

    for (let step = 1; step <= ANIMATION_STEPS; step++) {
        const animationGrid = spinSlots();
        const animationEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎰 5x5 Slots Machine • Spinning ${step}/${ANIMATION_STEPS}`)
            .setDescription(`Bet: ${bet.toLocaleString()} coins\n\n${formatGrid(animationGrid)}`);

        await msg.edit({ embeds: [animationEmbed] });
        await new Promise(resolve => setTimeout(resolve, ANIMATION_DELAY_MS));
    }

    let totalPayout = 0;
    let spinsRemaining = 1;
    let spinsPlayed = 0;
    let freeSpinsAwarded = 0;
    let totalWinningLines = 0;
    let lastSpecialCount = 0;
    let lastAwardedSpins = 0;
    let lastGrid = null;
    let skipRequested = false;
    const allWins = [];
    const summaryLines = [];

    const skipCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: SKIP_BUTTON_TIMEOUT_MS,
        filter: (interaction) => interaction.user.id === message.author.id && interaction.customId === SKIP_BUTTON_ID
    });

    skipCollector.on('collect', async (interaction) => {
        skipRequested = true;
        await interaction.update({ components: [createSkipRow(true)] });
    });

    while (spinsRemaining > 0 && spinsPlayed < MAX_TOTAL_SPINS) {
        const wasFreeSpin = spinsPlayed > 0;

        spinsRemaining--;
        spinsPlayed++;

        const grid = spinSlots();
        lastGrid = grid;

        const { totalPayout: spinPayout, wins } = calculatePayout(grid);
        totalPayout += spinPayout;
        totalWinningLines += wins.length;
        allWins.push(...wins);

        const specialCount = countSpecialSymbols(grid);
        const awardedSpins = calculateFreeSpins(specialCount);
        lastSpecialCount = specialCount;
        lastAwardedSpins = 0;

        const spinsBeforeAward = spinsRemaining;
        if (awardedSpins > 0 && spinsPlayed < MAX_TOTAL_SPINS) {
            spinsRemaining = Math.min(spinsRemaining + awardedSpins, MAX_TOTAL_SPINS - spinsPlayed);
            const actualAwardedSpins = Math.max(0, spinsRemaining - spinsBeforeAward);
            lastAwardedSpins = actualAwardedSpins;
            freeSpinsAwarded += actualAwardedSpins;
        }

        const spinLabel = wasFreeSpin ? `Free Spin ${spinsPlayed - 1}` : 'Base Spin';
        const lineText = wins.length > 0
            ? `+${spinPayout.toLocaleString()} coins (${wins.length} line${wins.length > 1 ? 's' : ''})`
            : 'No line wins';

        let detail = `• ${spinLabel}: ${lineText} • ${FREE_SPIN_SYMBOL} x${specialCount}`;
        if (lastAwardedSpins > 0) {
            detail += ` → +${lastAwardedSpins} free spins`;
        }

        summaryLines.push(detail);

        if (!skipRequested && spinsRemaining > 0) {
            const progressEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎰 5x5 Slots - Free Spins Rolling')
                .setDescription(`${formatGrid(grid)}\n\n${detail}`)
                .addFields(
                    { name: 'Total Payout So Far', value: `${totalPayout.toLocaleString()} coins`, inline: true },
                    { name: 'Spins Played', value: `${spinsPlayed}/${MAX_TOTAL_SPINS}`, inline: true },
                    { name: 'Spins Remaining', value: `${spinsRemaining}`, inline: true }
                )
                .setFooter({ text: 'Press ⏩ to skip reveal and instantly finish all remaining spins.' });

            await msg.edit({ embeds: [progressEmbed], components: [createSkipRow(false)] });
            await new Promise(resolve => setTimeout(resolve, SPIN_REVEAL_DELAY_MS));
        }
    }

    skipCollector.stop('finished');

    const won = totalPayout > 0;
    const net = totalPayout - bet;

    if (won) {
        await economyManager.addMoney(message.guild.id, message.author.id, totalPayout);
    }

    await gameStatsManager.recordSlots(message.author.id, won);

    let resultDescription = `${formatGrid(lastGrid)}\n\n`;
    if (won) {
        resultDescription += totalWinningLines >= 3
            ? '🎉 **Huge spin session!** Multiple paylines hit.'
            : '✨ **Nice!** You hit winning paylines.';
    } else {
        resultDescription += '😢 No paylines hit this time.';
    }

    if (freeSpinsAwarded > 0) {
        resultDescription += `\n\n${FREE_SPIN_SYMBOL} You unlocked **${freeSpinsAwarded}** free spins!`;
    }

    const sessionSummary = buildSessionSummary(summaryLines);
    const topWinningLines = formatWinningLines(allWins);
    const sessionRTP = totalPayout / bet;
    const safeTopWinningLines = clampFieldValue(topWinningLines);
    const safeSessionSummary = clampFieldValue(sessionSummary);

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle('🎰 5x5 Slots - Result')
        .setDescription(resultDescription)
        .addFields(
            { name: 'Bet', value: `${bet.toLocaleString()} coins`, inline: true },
            { name: 'Total Payout', value: won ? `✅ ${totalPayout.toLocaleString()} coins` : '❌ 0 coins', inline: true },
            { name: 'Net', value: net >= 0 ? `+${net.toLocaleString()} coins` : `${net.toLocaleString()} coins`, inline: true },
            { name: 'Spins', value: `${spinsPlayed} total (${freeSpinsAwarded} free)`, inline: true },
            { name: 'Winning Paylines', value: `${totalWinningLines}/${PAYLINES.length}`, inline: true },
            { name: 'Balance', value: `${economyManager.getUserData(message.guild.id, message.author.id).balance.toLocaleString()} coins`, inline: true },
            { name: 'Free Spin Symbols', value: `${FREE_SPIN_SYMBOL} x${lastSpecialCount} on last spin • +${lastAwardedSpins} free spins`, inline: false },
            { name: 'Session RTP', value: `${(sessionRTP * 100).toFixed(1)}%`, inline: true },
            { name: 'Top Wins', value: safeTopWinningLines },
            { name: 'Session Summary', value: safeSessionSummary }
        )
        .setFooter({ text: `${PAYLINES.length} patterns active • ${FREE_SPIN_SYMBOL} x${FREE_SPIN_TRIGGER_COUNT}+ grants free spins • Target RTP ${(TARGET_RTP * 100).toFixed(0)}%` });

    await msg.edit({ embeds: [resultEmbed], components: [] });
}
