module.exports = require('./poker.multiplayer.v2');
/*
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const { PokerTableManager } = require('../../utils/pokerTableManager');

const ACTIONS = new Set(['fold', 'check', 'call', 'bet', 'raise']);

module.exports = {
    name: 'poker',
    description: 'Play multiplayer Texas Hold\'em Poker!',
    usage: '!poker host <bet> | !poker join <bet> | !poker start | !poker action <fold|check|call|bet|raise> [amount] | !poker status',
    aliases: ['holdem', 'txpoker'],
    category: 'fun',
    async execute(message, args) {
        try {
            PokerTableManager.cleanupInactiveTables(10 * 60 * 1000);

            let subcommand = args[0]?.toLowerCase();
            if (!subcommand) {
                return message.reply('❌ Usage: `!poker host <bet>` | `!poker join <bet>` | `!poker start` | `!poker action <type> [amount]` | `!poker status`');
            }

            if (ACTIONS.has(subcommand)) {
                args = ['action', ...args];
                subcommand = 'action';
            }

            if (subcommand === 'host') return hostPoker(message, args);
            if (subcommand === 'join') return joinPoker(message, args);
            if (subcommand === 'start') return startHostedPoker(message);
            if (subcommand === 'action') return playerAction(message, args);
            if (subcommand === 'status') return pokerStatus(message);
            if (subcommand === 'leave') return leavePoker(message);

            return message.reply('❌ Unknown subcommand. Use: host, join, start, action, status, leave');
        } catch (error) {
            console.error('Error in poker command:', error);
            return message.reply('❌ An error occurred in poker.');
        }
    }
};

async function hostPoker(message, args) {
    const bet = parseInt(args[1], 10);
    if (!bet || bet < 10) {
        return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!poker host <bet>`');
    }

    const existing = PokerTableManager.getUserTable(message.author.id);
    if (existing) return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');

    const userData = economyManager.getUserData(message.guild.id, message.author.id);
    if (userData.balance < bet) {
        return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
    }

    const table = PokerTableManager.createTable(message.guild.id, message.channel.id, bet, 6);
    table.hostId = message.author.id;

    const added = PokerTableManager.addPlayerToTable(table.tableId, message.author.id, message.author.username, bet);
    if (!added) return message.reply('❌ Failed to create poker table.');

    await economyManager.removeMoney(message.guild.id, message.author.id, bet);

    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle('🎴 Poker Table Created')
        .setDescription(`${message.author} is hosting a poker table!`)
        .addFields(
            { name: 'Bet', value: `${bet} coins`, inline: true },
            { name: 'Players', value: '1/6', inline: true },
            { name: 'How to join', value: `Use \`!poker join ${bet}\` or click the button below.`, inline: false },
            { name: 'How to start', value: 'Host can click **Start Game** or use `!poker start`.', inline: false }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`poker_join_${table.tableId}`).setLabel('Join Table').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`poker_start_${table.tableId}`).setLabel('Start Game').setStyle(ButtonStyle.Primary)
    );

    const tableMsg = await message.reply({ embeds: [embed], components: [row] });
    setupTableLobby(message, table, tableMsg);
}

async function joinPoker(message, args) {
    const bet = parseInt(args[1]);

    if (!bet || bet < 10) {
        return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!poker join <bet>`');
    }

    // Check if user has enough money
    const userData = economyManager.getUserData(message.guild.id, message.author.id);
    if (userData.balance < bet) {
        return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
    }

    // Check if user already has a table
    if (PokerTableManager.getUserTable(message.author.id)) {
        return message.reply('❌ You are already in a poker game!');
    }

    // Find a table with matching bet and waiting for players
    let table = null;
    for (const [, t] of PokerTableManager.tables) {
        if (t.guildId === message.guild.id && 
            t.minBet === bet && 
            !t.gameStarted && 
            t.getTotalPlayers() < t.maxPlayers) {
            table = t;
            break;
        }
    }

    if (!table) {
        return message.reply(`❌ No available poker tables with ${bet} coin bet. Use \`!poker host ${bet}\` to create one!`);
    }

    // Add player to table
    PokerTableManager.addPlayerToTable(table.tableId, message.author.id, message.author.username, bet);
    economyManager.removeMoney(message.guild.id, message.author.id, bet);

    message.reply(`✅ Joined poker table! Waiting for host to start...`);
}

async function playerAction(message, args) {
    const action = args[1]?.toLowerCase();

    if (!action) {
        return message.reply('❌ Specify action: fold, check, call, bet, raise');
    }

    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table || !table.gameStarted) {
        return message.reply('❌ You are not in an active poker game!');
    }

    const currentPlayer = table.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.userId !== message.author.id) {
        return message.reply('❌ It\'s not your turn!');
    }

    if (action === 'fold') {
        table.playerFold(message.author.id);
        message.reply(`${message.author} folds.`);
    } else if (action === 'check') {
        if (!table.playerCheck(message.author.id)) {
            return message.reply('❌ Cannot check - there\'s an uncalled bet!');
        }
        message.reply(`${message.author} checks.`);
    } else if (action === 'call') {
        const amount = table.currentBet - currentPlayer.bet;
        if (amount <= 0) {
            return message.reply('❌ No bet to call!');
        }
        table.playerCall(message.author.id);
        message.reply(`${message.author} calls ${amount} coins.`);
    } else if (action === 'bet') {
        const amount = parseInt(args[2]);
        if (!amount || amount < table.minBet) {
            return message.reply(`❌ Minimum bet: ${table.minBet} coins`);
        }
        table.playerBet(message.author.id, amount);
        message.reply(`${message.author} bets ${amount} coins.`);
    } else if (action === 'raise') {
        const amount = parseInt(args[2]);
        if (!amount || amount <= table.currentBet) {
            return message.reply(`❌ Raise must be higher than current bet (${table.currentBet})`);
        }
        table.playerBet(message.author.id, amount);
        message.reply(`${message.author} raises to ${amount} coins.`);
    } else {
        message.reply('❌ Unknown action!');
    }

    table.nextPlayer();
}

async function pokerStatus(message) {
    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table) {
        return message.reply('❌ You are not in a poker game!');
    }

    const statusEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Poker Table Status')
        .addFields(
            { name: 'Phase', value: table.gamePhase.toUpperCase(), inline: true },
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Current Bet', value: `${table.currentBet} coins`, inline: true },
            { name: 'Community Cards', value: table.community.length > 0 ? formatCards(table.community) : 'None yet', inline: false },
            { name: 'Players', value: getPlayerStatus(table), inline: false }
        );

    message.reply({ embeds: [statusEmbed] });
}

function setupTableLobby(message, table, tableMsg) {
    const collector = tableMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60000 });

    collector.on('collect', async (interaction) => {
        if (interaction.customId.startsWith('poker_join_')) {
            const tableId = interaction.customId.replace('poker_join_', '');
            const t = PokerTableManager.getTable(tableId);

            if (!t) {
                return interaction.reply({ content: '❌ Table not found!', flags: MessageFlags.Ephemeral });
            }

            const userData = economyManager.getUserData(message.guild.id, interaction.user.id);
            if (userData.balance < t.minBet) {
                return interaction.reply({ content: `❌ You don't have enough coins!`, flags: MessageFlags.Ephemeral });
            }

            if (PokerTableManager.addPlayerToTable(tableId, interaction.user.id, interaction.user.username, t.minBet)) {
                economyManager.removeMoney(message.guild.id, interaction.user.id, t.minBet);
                await interaction.reply({ content: `✅ Joined poker table!`, flags: MessageFlags.Ephemeral });
                
                // Update table embed
                updateTableLobby(tableMsg, t);
            } else {
                interaction.reply({ content: '❌ Could not join table!', flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.customId.startsWith('poker_start_')) {
            const tableId = interaction.customId.replace('poker_start_', '');
            const t = PokerTableManager.getTable(tableId);

            if (!t) {
                return interaction.reply({ content: '❌ Table not found!', flags: MessageFlags.Ephemeral });
            }

            if (interaction.user.id !== Array.from(t.players.values())[0].userId) {
                return interaction.reply({ content: '❌ Only the host can start!', flags: MessageFlags.Ephemeral });
            }

            if (!t.canStartGame()) {
                return interaction.reply({ content: '❌ Need 2-6 players to start!', flags: MessageFlags.Ephemeral });
            }

            await interaction.reply({ content: '🎴 Game starting...', flags: MessageFlags.Ephemeral });
            collector.stop();
            await startPokerGame(message, t, tableMsg);
        }
    });
}

function updateTableLobby(tableMsg, table) {
    const players = table.getAllPlayers().map(p => `• ${p.username}`).join('\n');
    const embed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Poker Table')
        .setDescription(`**Players: ${table.getTotalPlayers()}/${table.maxPlayers}**`)
        .addFields(
            { name: 'Join', value: players || 'Waiting for players...', inline: false },
            { name: 'Bet', value: `${table.minBet} coins`, inline: true }
        );

    tableMsg.edit({ embeds: [embed] }).catch(() => {});
}

async function startPokerGame(message, table, tableMsg) {
    table.startGame();

    const gameEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 TEXAS HOLD\'EM - PREFLOP')
        .addFields(
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Players', value: `${table.getTotalPlayers()}`, inline: true },
            { name: 'Players in Hand', value: getPlayerStatus(table), inline: false },
            { name: 'Current to Act', value: `${table.getCurrentPlayer()?.username || 'None'}`, inline: false }
        );

    await tableMsg.edit({ embeds: [gameEmbed], components: [] });

    // Simple preflop betting
    await conductBettingRound(message, table, tableMsg);
    
    if (table.getActivePlayers().length <= 1) {
        return endPokerHand(message, table, tableMsg);
    }

    // Flop
    table.dealFlop();
    await updateGameDisplay(tableMsg, table, 'FLOP');
    await conductBettingRound(message, table, tableMsg);

    if (table.getActivePlayers().length <= 1) {
        return endPokerHand(message, table, tableMsg);
    }

    // Turn
    table.dealTurn();
    await updateGameDisplay(tableMsg, table, 'TURN');
    await conductBettingRound(message, table, tableMsg);

    if (table.getActivePlayers().length <= 1) {
        return endPokerHand(message, table, tableMsg);
    }

    // River
    table.dealRiver();
    await updateGameDisplay(tableMsg, table, 'RIVER');
    await conductBettingRound(message, table, tableMsg);

    // Showdown
    await showdown(message, table, tableMsg);
}

async function conductBettingRound(message, table, tableMsg) {
    const roundTimeout = 30000;
    let bettingComplete = false;

    while (!bettingComplete && table.getActivePlayers().length > 1) {
        const currentPlayer = table.getCurrentPlayer();
        if (!currentPlayer) break;

        const actionMsg = await message.channel.send(
            `⏳ **${currentPlayer.username}** - Your turn! Use \`!poker action <fold|check|bet|raise> [amount]\``
        );

        let actionTaken = false;
        const actionFilter = m => m.author.id === currentPlayer.userId && m.content.toLowerCase().startsWith('!poker action');
        
        const actionCollector = message.channel.createMessageCollector({ filter: actionFilter, max: 1, time: roundTimeout });

        await new Promise(resolve => {
            actionCollector.on('collect', (m) => {
                actionTaken = true;
                resolve();
            });
            actionCollector.on('end', () => {
                resolve();
            });
        });

        if (!actionTaken) {
            table.playerFold(currentPlayer.userId);
            await message.channel.send(`⏱️ ${currentPlayer.username} didn't act - folded!`);
        }

        actionMsg.delete().catch(() => {});

        bettingComplete = table.isRoundComplete();
        if (!bettingComplete) {
            table.nextPlayer();
        }
    }
}

async function updateGameDisplay(tableMsg, table, phase) {
    const embed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle(`🎴 TEXAS HOLD'EM - ${phase}`)
        .addFields(
            { name: 'Community', value: formatCards(table.community) || 'None', inline: false },
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Active Players', value: `${table.getActivePlayers().length}`, inline: true }
        );

    await tableMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
}

async function showdown(message, table, tableMsg) {
    const activePlayers = table.getActivePlayers();

    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎉 Winner!')
            .setDescription(`${winner.username} wins ${table.pot} coins!`)
            .addFields({ name: 'Remaining players folded', value: `All players folded. ${winner.username} takes the pot!` });

        await tableMsg.edit({ embeds: [embed], components: [] });
        return;
    }

    // Evaluate hands for remaining players
    const hands = activePlayers.map(p => ({
        player: p,
        hand: evaluateHand([...p.hole, ...table.community]),
    })).sort((a, b) => b.hand.value - a.hand.value);

    const winner = hands[0].player;
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎴 Showdown!')
        .setDescription(`${winner.username} wins with **${hands[0].hand.rank}**!`)
        .addFields(
            { name: 'Winning Hand', value: formatCards(hands[0].hand.cards), inline: false },
            { name: 'Pot Won', value: `${table.pot} coins`, inline: true }
        );

    await tableMsg.edit({ embeds: [embed], components: [] });
}

async function endPokerHand(message, table, tableMsg) {
    const activePlayers = table.getActivePlayers();
    if (activePlayers.length === 0) return;

    const winner = activePlayers[0];
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎉 Hand Complete!')
        .setDescription(`${winner.username} wins ${table.pot} coins!`);

    await tableMsg.edit({ embeds: [embed], components: [] });
}

function getPlayerStatus(table) {
    return table.getAllPlayers()
        .map(p => `${p.folded ? '❌' : '✅'} ${p.username} (${p.chips} chips)`)
        .join('\n');
}

function formatCards(cards) {
    return cards.map(c => `${c.rank}${c.suit}`).join(' ') || 'None';
}

function evaluateHand(cards) {
    if (cards.length < 5) return { rank: 'Unknown', value: 0, cards: [] };

    const getCardValue = (rank) => {
        const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return values[rank];
    };

    function combinations(arr, r) {
        if (r === 0) return [[]];
        if (arr.length === 0) return [];
        const [head, ...tail] = arr;
        const withHead = combinations(tail, r - 1).map(c => [head, ...c]);
        const withoutHead = combinations(tail, r);
        return [...withHead, ...withoutHead];
    }

    const allCombos = combinations(cards, 5);
    let bestHand = null;
    let bestRank = -1;

    for (const combo of allCombos) {
        const rank = rankHand(combo, getCardValue);
        if (rank.value > bestRank) {
            bestRank = rank.value;
            bestHand = { ...rank, cards: combo };
        }
    }

    return bestHand || { rank: 'High Card', value: 0, cards };
}

function rankHand(cards, getCardValue) {
    const ranks = cards.map(c => getCardValue(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    
    const isFlush = new Set(suits).size === 1;
    const checkStraight = () => {
        if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) return true;
        if (ranks[0] === 14 && ranks[4] === 2 && ranks[3] === 3 && ranks[2] === 4 && ranks[1] === 5) return true;
        return false;
    };
    const isStraight = checkStraight();

    const countPairs = () => {
        const counts = {};
        ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
        const pairs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return {
            four: pairs[0]?.[1] === 4 ? pairs[0][0] : null,
            three: pairs[0]?.[1] === 3 ? pairs[0][0] : null,
            pair: pairs[0]?.[1] >= 2 ? pairs[0][0] : null,
            pair2: pairs[1]?.[1] >= 2 ? pairs[1][0] : null
        };
    };
    const pairs = countPairs();

    if (isFlush && isStraight && ranks[0] === 14 && ranks[4] === 10) {
        return { rank: '🏆 Royal Flush', value: 10000 };
    }
    if (isFlush && isStraight) return { rank: '🎴 Straight Flush', value: 9000 + ranks[0] };
    if (pairs.four) return { rank: '4️⃣ Four of a Kind', value: 8000 + pairs.four };
    if (pairs.three && pairs.pair) return { rank: '🏠 Full House', value: 7000 + pairs.three };
    if (isFlush) return { rank: '🌊 Flush', value: 6000 + ranks[0] };
    if (isStraight) return { rank: '➡️ Straight', value: 5000 + ranks[0] };
    if (pairs.three) return { rank: '3️⃣ Three of a Kind', value: 4000 + pairs.three };
    if (pairs.pair && pairs.pair2) return { rank: '👥 Two Pair', value: 3000 + pairs.pair };
    if (pairs.pair) return { rank: '👤 One Pair', value: 2000 + pairs.pair };
    return { rank: '🎯 High Card', value: 1000 + ranks[0] };
}

// Card deck and utilities
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ rank, suit });
        }
    }
    
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function getCardValue(rank) {
    const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return values[rank];
}

function formatCard(card) {
    return `${card.rank}${card.suit}`;
}

function formatHand(cards, hideCount = 0) {
    return cards.map((c, i) => i < hideCount ? '🂠' : formatCard(c)).join(' ');
}

// Hand ranking system
function evaluateHand(cards) {
    // Takes 7 cards (5 community + 2 hole), returns best 5-card hand
    if (cards.length < 5) return null;
    
    let bestHand = null;
    let bestRank = -1;
    
    // Generate all 5-card combinations
    function combinations(arr, r) {
        if (r === 0) return [[]];
        if (arr.length === 0) return [];
        const [head, ...tail] = arr;
        const withHead = combinations(tail, r - 1).map(c => [head, ...c]);
        const withoutHead = combinations(tail, r);
        return [...withHead, ...withoutHead];
    }
    
    const allCombos = combinations(cards, 5);
    
    for (const combo of allCombos) {
        const rank = rankHand(combo);
        if (rank.value > bestRank) {
            bestRank = rank.value;
            bestHand = { cards: combo, rank: rank.name, value: rank.value };
        }
    }
    
    return bestHand;
}

function rankHand(cards) {
    // Input: 5 cards, output: {name, value}
    const ranks = cards.map(c => getCardValue(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    
    const isFlush = new Set(suits).size === 1;
    const isStraight = checkStraight(ranks);
    const pairs = countPairs(ranks);
    
    // Royal Flush (10-J-Q-K-A of same suit)
    if (isFlush && isStraight && ranks[0] === 14 && ranks[4] === 10) {
        return { name: '🏆 Royal Flush', value: 10000 };
    }
    
    // Straight Flush
    if (isFlush && isStraight) {
        return { name: '🎴 Straight Flush', value: 9000 + ranks[0] };
    }
    
    // Four of a Kind
    if (pairs.four) {
        return { name: '4️⃣ Four of a Kind', value: 8000 + pairs.four };
    }
    
    // Full House
    if (pairs.three && pairs.pair) {
        return { name: '🏠 Full House', value: 7000 + pairs.three };
    }
    
    // Flush
    if (isFlush) {
        return { name: '🌊 Flush', value: 6000 + ranks[0] };
    }
    
    // Straight
    if (isStraight) {
        return { name: '➡️ Straight', value: 5000 + ranks[0] };
    }
    
    // Three of a Kind
    if (pairs.three) {
        return { name: '3️⃣ Three of a Kind', value: 4000 + pairs.three };
    }
    
    // Two Pair
    if (pairs.pair && pairs.pair2) {
        return { name: '👥 Two Pair', value: 3000 + pairs.pair };
    }
    
    // One Pair
    if (pairs.pair) {
        return { name: '👤 One Pair', value: 2000 + pairs.pair };
    }
    
    // High Card
    return { name: '🎯 High Card', value: 1000 + ranks[0] };
}

function checkStraight(sortedRanks) {
    // Check normal straight
    if (sortedRanks[0] - sortedRanks[4] === 4 && new Set(sortedRanks).size === 5) {
        return true;
    }
    // Check for Ace-low straight (A-2-3-4-5)
    if (sortedRanks[0] === 14 && sortedRanks[4] === 2 && sortedRanks[3] === 3 && sortedRanks[2] === 4 && sortedRanks[1] === 5) {
        return true;
    }
    return false;
}

function countPairs(ranks) {
    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    
    const pairs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    return {
        four: pairs[0]?.[1] === 4 ? pairs[0][0] : null,
        three: pairs[0]?.[1] === 3 ? pairs[0][0] : null,
        pair: pairs[0]?.[1] >= 2 ? pairs[0][0] : null,
        pair2: pairs[1]?.[1] >= 2 ? pairs[1][0] : null
    };
}

// Main game function
async function playPoker(message, initialBet) {
    const deck = createDeck();
    const playerHole = [deck.pop(), deck.pop()];
    const dealerHole = [deck.pop(), deck.pop()];
    
    const community = [];
    let currentBet = initialBet;
    let playerChips = initialBet;
    let dealerChips = initialBet;
    let pot = initialBet * 2;
    
    // Show initial hand
    const initialEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Texas Hold\'em Poker')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: 'Your Hand', value: formatHand(playerHole), inline: false },
            { name: 'Dealer Hand', value: formatHand(dealerHole, 2), inline: false },
            { name: 'Pot', value: `${pot} coins`, inline: true },
            { name: 'Your Chips', value: `${playerChips} coins`, inline: true }
        )
        .setFooter({ text: 'Preflop: Fold, Check, or Raise?' });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poker_fold')
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('poker_check')
            .setLabel('Check')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('poker_raise')
            .setLabel('Raise')
            .setStyle(ButtonStyle.Success)
    );
    
    const gameMsg = await message.reply({ embeds: [initialEmbed], components: [row], fetchReply: true });
    
    // Create collector
    const collector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1 });
    
    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '❌ This is not your game!', flags: MessageFlags.Ephemeral });
        }
        
        if (interaction.customId === 'poker_fold') {
            // Dealer wins
            await finishRound(message, gameMsg, interaction, 'fold', playerHole, dealerHole, community, pot, initialBet);
        } else if (interaction.customId === 'poker_check') {
            // Continue to flop
            await showFlop(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet);
        } else if (interaction.customId === 'poker_raise') {
            // Show raise modal
            await showRaiseModal(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, playerChips, initialBet);
        }
    });
    
    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            await message.reply('⏱️ Poker game timed out!');
        }
    });
}

async function showFlop(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet) {
    await interaction.deferUpdate();
    
    // Deal flop (3 cards)
    community.push(deck.pop(), deck.pop(), deck.pop());
    
    const flopEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Texas Hold\'em - FLOP')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: 'Your Hand', value: formatHand(playerHole), inline: false },
            { name: 'Community Cards', value: formatHand(community), inline: false },
            { name: 'Dealer (Hidden)', value: '🂠 🂠', inline: false },
            { name: 'Pot', value: `${pot} coins`, inline: true }
        )
        .setFooter({ text: 'Flop: Fold, Check, or Raise?' });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poker_fold')
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('poker_check')
            .setLabel('Check')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('poker_raise')
            .setLabel('Raise')
            .setStyle(ButtonStyle.Success)
    );
    
    await gameMsg.edit({ embeds: [flopEmbed], components: [row] });
    
    const collector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1 });
    
    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '❌ This is not your game!', flags: MessageFlags.Ephemeral });
        }
        
        if (interaction.customId === 'poker_fold') {
            await finishRound(message, gameMsg, interaction, 'fold', playerHole, dealerHole, community, pot, initialBet);
        } else if (interaction.customId === 'poker_check') {
            await showTurn(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet);
        } else if (interaction.customId === 'poker_raise') {
            await showRaiseModal(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, currentBet, initialBet);
        }
    });
}

async function showTurn(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet) {
    await interaction.deferUpdate();
    
    // Deal turn (1 card)
    community.push(deck.pop());
    
    const turnEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Texas Hold\'em - TURN')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: 'Your Hand', value: formatHand(playerHole), inline: false },
            { name: 'Community Cards', value: formatHand(community), inline: false },
            { name: 'Dealer (Hidden)', value: '🂠 🂠', inline: false },
            { name: 'Pot', value: `${pot} coins`, inline: true }
        )
        .setFooter({ text: 'Turn: Fold, Check, or Raise?' });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poker_fold')
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('poker_check')
            .setLabel('Check')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('poker_raise')
            .setLabel('Raise')
            .setStyle(ButtonStyle.Success)
    );
    
    await gameMsg.edit({ embeds: [turnEmbed], components: [row] });
    
    const collector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1 });
    
    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '❌ This is not your game!', flags: MessageFlags.Ephemeral });
        }
        
        if (interaction.customId === 'poker_fold') {
            await finishRound(message, gameMsg, interaction, 'fold', playerHole, dealerHole, community, pot, initialBet);
        } else if (interaction.customId === 'poker_check') {
            await showRiver(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet);
        } else if (interaction.customId === 'poker_raise') {
            await showRaiseModal(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, currentBet, initialBet);
        }
    });
}

async function showRiver(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, initialBet) {
    await interaction.deferUpdate();
    
    // Deal river (final card)
    community.push(deck.pop());
    
    const riverEmbed = new EmbedBuilder()
        .setColor(0x228B22)
        .setTitle('🎴 Texas Hold\'em - RIVER')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: 'Your Hand', value: formatHand(playerHole), inline: false },
            { name: 'Community Cards', value: formatHand(community), inline: false },
            { name: 'Dealer (Hidden)', value: '🂠 🂠', inline: false },
            { name: 'Pot', value: `${pot} coins`, inline: true }
        )
        .setFooter({ text: 'River (Final): Fold or Check?' });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poker_fold')
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('poker_check')
            .setLabel('Check (Showdown)')
            .setStyle(ButtonStyle.Success)
    );
    
    await gameMsg.edit({ embeds: [riverEmbed], components: [row] });
    
    const collector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1 });
    
    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '❌ This is not your game!', flags: MessageFlags.Ephemeral });
        }
        
        if (interaction.customId === 'poker_fold') {
            await finishRound(message, gameMsg, interaction, 'fold', playerHole, dealerHole, community, pot, initialBet);
        } else {
            // Showdown
            await showdown(message, gameMsg, interaction, playerHole, dealerHole, community, pot, initialBet);
        }
    });
}

async function showdown(message, gameMsg, interaction, playerHole, dealerHole, community, pot, initialBet) {
    await interaction.deferUpdate();
    
    // Evaluate hands
    const playerCards = [...playerHole, ...community];
    const dealerCards = [...dealerHole, ...community];
    
    const playerBest = evaluateHand(playerCards);
    const dealerBest = evaluateHand(dealerCards);
    
    let result = '';
    let payout = 0;
    let color = 0xed4245;
    
    if (playerBest.value > dealerBest.value) {
        result = '🎉 You Win!';
        payout = pot;
        color = 0x57f287;
        await gameStatsManager.recordPoker(message.author.id, 'win');
    } else if (dealerBest.value > playerBest.value) {
        result = '🃏 Dealer Wins!';
        payout = 0;
        color = 0xed4245;
        await gameStatsManager.recordPoker(message.author.id, 'loss');
    } else {
        result = '🤝 It\'s a Tie! (Split Pot)';
        payout = Math.floor(pot / 2);
        color = 0xf1c40f;
        await gameStatsManager.recordPoker(message.author.id, 'tie');
    }
    
    if (payout > 0) {
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
    }
    
    const showdownEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🎴 Showdown!')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: `Your Hand (${playerBest.rank})`, value: formatHand(playerHole), inline: false },
            { name: `Best 5-Card: ${playerBest.rank}`, value: formatHand(playerBest.cards), inline: false },
            { name: '', value: '', inline: false },
            { name: `Dealer Hand (${dealerBest.rank})`, value: formatHand(dealerHole), inline: false },
            { name: `Best 5-Card: ${dealerBest.rank}`, value: formatHand(dealerBest.cards), inline: false },
            { name: '', value: '', inline: false },
            { name: '💰 Pot', value: `${pot} coins`, inline: true },
            { name: '💸 Payout', value: `${payout} coins`, inline: true }
        )
        .setDescription(result)
        .setFooter({ text: `Initial Bet: ${initialBet} coins` });
    
    await gameMsg.edit({ embeds: [showdownEmbed], components: [] });
}

async function finishRound(message, gameMsg, interaction, action, playerHole, dealerHole, community, pot, initialBet) {
    await interaction.deferUpdate();
    
    let result = '';
    let payout = 0;
    let color = 0xed4245;
    
    if (action === 'fold') {
        result = '🃏 You folded! Dealer wins the pot.';
        payout = 0;
        color = 0xed4245;
        await gameStatsManager.recordPoker(message.author.id, 'loss');
    }
    
    if (payout > 0) {
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
    }
    
    const finishEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🎴 Poker - Game Over')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: 'Your Hand', value: formatHand(playerHole), inline: false },
            { name: 'Dealer Hand', value: formatHand(dealerHole), inline: false },
            { name: 'Pot', value: `${pot} coins`, inline: true },
            { name: 'Payout', value: `${payout} coins`, inline: true }
        )
        .setDescription(result)
        .setFooter({ text: `Initial Bet: ${initialBet} coins` });
    
    await gameMsg.edit({ embeds: [finishEmbed], components: [] });
}

async function showRaiseModal(message, gameMsg, interaction, playerHole, dealerHole, community, deck, pot, currentBet, playerChips, initialBet) {
    const modal = new ModalBuilder()
        .setCustomId('poker_raise_modal')
        .setTitle('Raise Bet');
    
    const raiseInput = new TextInputBuilder()
        .setCustomId('raise_amount')
        .setLabel('Raise Amount (minimum: 10 coins)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(5)
        .setPlaceholder('Enter raise amount');
    
    const row = new ActionRowBuilder().addComponents(raiseInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
    
    const modalSubmit = await interaction.awaitModalSubmit({ time: 60000 }).catch(() => null);
    
    if (!modalSubmit) return;
    
    const raiseAmount = parseInt(modalSubmit.fields.getTextInputValue('raise_amount'));
    
    if (isNaN(raiseAmount) || raiseAmount < 10) {
        return modalSubmit.reply({ content: '❌ Invalid raise amount!', flags: MessageFlags.Ephemeral });
    }
    
    await modalSubmit.deferUpdate();
    
    // Continue game with raise
    // For simplicity, dealer automatically calls the raise
    pot += raiseAmount * 2;
    
    // Continue to next round
    if (community.length === 0) {
        await showFlop(message, gameMsg, modalSubmit, playerHole, dealerHole, community, deck, pot, raiseAmount, initialBet);
    } else if (community.length === 3) {
        await showTurn(message, gameMsg, modalSubmit, playerHole, dealerHole, community, deck, pot, raiseAmount, initialBet);
    } else if (community.length === 4) {
        await showRiver(message, gameMsg, modalSubmit, playerHole, dealerHole, community, deck, pot, raiseAmount, initialBet);
    }
}

*/
