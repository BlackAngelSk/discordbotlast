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
    const bet = parseInt(args[1], 10);
    if (!bet || bet < 10) {
        return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!poker join <bet>`');
    }

    const existing = PokerTableManager.getUserTable(message.author.id);
    if (existing) return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');

    const userData = economyManager.getUserData(message.guild.id, message.author.id);
    if (userData.balance < bet) {
        return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
    }

    let table = null;
    for (const [, t] of PokerTableManager.tables) {
        if (t.guildId === message.guild.id && t.channelId === message.channel.id && t.minBet === bet && !t.gameStarted && t.getTotalPlayers() < t.maxPlayers) {
            table = t;
            break;
        }
    }

    if (!table) {
        return message.reply(`❌ No waiting table with ${bet} coin bet in this channel. Use \`!poker host ${bet}\`.`);
    }

    const added = PokerTableManager.addPlayerToTable(table.tableId, message.author.id, message.author.username, bet);
    if (!added) return message.reply('❌ Could not join this table.');

    await economyManager.removeMoney(message.guild.id, message.author.id, bet);
    return message.reply('✅ Joined poker table! Waiting for host to start...');
}

async function startHostedPoker(message) {
    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table) return message.reply('❌ You are not in a poker table.');
    if (table.gameStarted) return message.reply('❌ This game already started.');
    if (table.hostId !== message.author.id) return message.reply('❌ Only the host can start the game.');
    if (!table.canStartGame()) return message.reply('❌ Need 2-6 players to start.');

    return runGameLoop(message.channel, table);
}

async function leavePoker(message) {
    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table) return message.reply('❌ You are not in a poker table.');
    if (table.gameStarted) return message.reply('❌ You cannot leave while the hand is running.');

    const wasHost = table.hostId === message.author.id;
    const minBet = table.minBet;

    PokerTableManager.removePlayerFromTable(message.author.id);
    await economyManager.addMoney(message.guild.id, message.author.id, minBet);

    if (wasHost) {
        PokerTableManager.closeTable(table.tableId);
        return message.reply('✅ You left and closed the hosted table. Your buy-in was refunded.');
    }

    return message.reply('✅ You left the table. Your buy-in was refunded.');
}

async function playerAction(message, args) {
    const action = args[1]?.toLowerCase();
    if (!action || !ACTIONS.has(action)) {
        return message.reply('❌ Specify action: fold, check, call, bet, raise');
    }

    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table || !table.gameStarted) return message.reply('❌ You are not in an active poker game!');

    const currentPlayer = table.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.userId !== message.author.id) {
        return message.reply(`❌ It's not your turn! Current turn: ${table.getCurrentPlayer()?.username || 'Unknown'}`);
    }

    let ok = false;
    let msg = '';

    if (action === 'fold') {
        ok = table.playerFold(message.author.id);
        msg = `${message.author} folds.`;
    } else if (action === 'check') {
        ok = table.playerCheck(message.author.id);
        if (!ok) return message.reply('❌ Cannot check - there is an uncalled bet.');
        msg = `${message.author} checks.`;
    } else if (action === 'call') {
        const callAmount = Math.max(0, table.currentBet - currentPlayer.bet);
        if (callAmount <= 0) return message.reply('❌ Nothing to call. Use `check`.');
        ok = table.playerCall(message.author.id);
        msg = `${message.author} calls ${callAmount} coins.`;
    } else if (action === 'bet') {
        const amount = parseInt(args[2], 10);
        if (!amount || amount < table.minBet) return message.reply(`❌ Minimum bet is ${table.minBet}.`);
        if (table.currentBet > 0) return message.reply(`❌ Bet is already open (${table.currentBet}). Use 'raise'.`);

        const contribute = amount - currentPlayer.bet;
        if (contribute <= 0) return message.reply('❌ Invalid bet amount.');
        ok = table.playerBet(message.author.id, contribute);
        msg = `${message.author} bets ${amount} coins.`;
    } else if (action === 'raise') {
        const target = parseInt(args[2], 10);
        if (!target || target <= table.currentBet) {
            return message.reply(`❌ Raise must be higher than current bet (${table.currentBet}).`);
        }

        const contribute = target - currentPlayer.bet;
        if (contribute <= 0) return message.reply('❌ Invalid raise amount.');
        ok = table.playerBet(message.author.id, contribute);
        msg = `${message.author} raises to ${target} coins.`;
    }

    if (!ok) return message.reply('❌ Action failed.');

    table.actionCounter = (table.actionCounter || 0) + 1;
    table.lastActivityTime = Date.now();

    if (!table.isRoundComplete() && table.getActivePlayers().length > 1) {
        table.nextPlayer();
    }

    return message.reply(msg);
}

async function pokerStatus(message) {
    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table) return message.reply('❌ You are not in a poker game!');

    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle('🎴 Poker Table Status')
        .addFields(
            { name: 'Phase', value: table.gamePhase.toUpperCase(), inline: true },
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Current Bet', value: `${table.currentBet} coins`, inline: true },
            { name: 'Current Turn', value: table.getCurrentPlayer()?.username || 'None', inline: false },
            { name: 'Community', value: formatCards(table.community), inline: false },
            { name: 'Players', value: getPlayerStatus(table), inline: false }
        );

    return message.reply({ embeds: [embed] });
}

function setupTableLobby(message, table, tableMsg) {
    const collector = tableMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });
    let startingGame = false;

    collector.on('collect', async (interaction) => {
        if (interaction.customId === `poker_join_${table.tableId}`) {
            const t = PokerTableManager.getTable(table.tableId);
            if (!t || t.gameStarted) return interaction.reply({ content: '❌ Table not available.', flags: MessageFlags.Ephemeral });

            if (PokerTableManager.getUserTable(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are already in a poker table.', flags: MessageFlags.Ephemeral });
            }

            const userData = economyManager.getUserData(message.guild.id, interaction.user.id);
            if (userData.balance < t.minBet) {
                return interaction.reply({ content: `❌ You don't have enough coins (${t.minBet} needed).`, flags: MessageFlags.Ephemeral });
            }

            const added = PokerTableManager.addPlayerToTable(t.tableId, interaction.user.id, interaction.user.username, t.minBet);
            if (!added) {
                return interaction.reply({ content: '❌ Could not join table.', flags: MessageFlags.Ephemeral });
            }

            await economyManager.removeMoney(message.guild.id, interaction.user.id, t.minBet);
            await interaction.reply({ content: '✅ Joined poker table!', flags: MessageFlags.Ephemeral });
            await updateTableLobby(tableMsg, t);
            return;
        }

        if (interaction.customId === `poker_start_${table.tableId}`) {
            const t = PokerTableManager.getTable(table.tableId);
            if (!t) return interaction.reply({ content: '❌ Table not found.', flags: MessageFlags.Ephemeral });
            if (interaction.user.id !== t.hostId) return interaction.reply({ content: '❌ Only host can start.', flags: MessageFlags.Ephemeral });
            if (!t.canStartGame()) return interaction.reply({ content: '❌ Need 2-6 players.', flags: MessageFlags.Ephemeral });

            await interaction.reply({ content: '🎴 Game starting...', flags: MessageFlags.Ephemeral });
            startingGame = true;
            collector.stop('game_start');
            return runGameLoop(message.channel, t, tableMsg);
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (startingGame || reason === 'game_start') return;

        const t = PokerTableManager.getTable(table.tableId);
        if (!t || t.gameStarted) return;

        for (const p of t.getAllPlayers()) {
            await economyManager.addMoney(t.guildId, p.userId, t.minBet);
        }
        PokerTableManager.closeTable(t.tableId);
        tableMsg.edit({ components: [] }).catch(() => {});
    });
}

async function updateTableLobby(tableMsg, table) {
    const players = table.getAllPlayers().map(p => `• ${p.username}`).join('\n') || 'Waiting...';
    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle('🎴 Poker Table')
        .addFields(
            { name: 'Bet', value: `${table.minBet} coins`, inline: true },
            { name: 'Players', value: `${table.getTotalPlayers()}/${table.maxPlayers}`, inline: true },
            { name: 'List', value: players, inline: false }
        );

    await tableMsg.edit({ embeds: [embed] }).catch(() => {});
}

async function runGameLoop(channel, table, tableMsg = null) {
    if (!table.startGame()) {
        return channel.send('❌ Could not start poker game.');
    }

    const gameMessage = tableMsg || await channel.send('🎴 Poker game started!');

    await updateGameDisplay(gameMessage, table, 'PREFLOP');
    await conductBettingRound(channel, table);

    if (table.getActivePlayers().length <= 1) return finishAndCleanup(channel, table, gameMessage);

    table.dealFlop();
    await updateGameDisplay(gameMessage, table, 'FLOP');
    await conductBettingRound(channel, table);

    if (table.getActivePlayers().length <= 1) return finishAndCleanup(channel, table, gameMessage);

    table.dealTurn();
    await updateGameDisplay(gameMessage, table, 'TURN');
    await conductBettingRound(channel, table);

    if (table.getActivePlayers().length <= 1) return finishAndCleanup(channel, table, gameMessage);

    table.dealRiver();
    await updateGameDisplay(gameMessage, table, 'RIVER');
    await conductBettingRound(channel, table);

    return finishAndCleanup(channel, table, gameMessage, true);
}

async function conductBettingRound(channel, table) {
    while (!table.isRoundComplete() && table.getActivePlayers().length > 1) {
        const current = table.getCurrentPlayer();
        if (!current) break;

        const prompt = await channel.send(`⏳ **${current.username}**, your turn. Use \`!poker action <fold|check|call|bet|raise> [amount]\``);
        const startCounter = table.actionCounter || 0;
        const acted = await waitForAction(table, startCounter, 30000);
        await prompt.delete().catch(() => {});

        if (!acted) {
            table.playerFold(current.userId);
            table.actionCounter = (table.actionCounter || 0) + 1;
            await channel.send(`⏱️ ${current.username} did not act in time and folded.`);

            if (!table.isRoundComplete() && table.getActivePlayers().length > 1) {
                table.nextPlayer();
            }
        }
    }
}

function waitForAction(table, startCounter, timeoutMs) {
    return new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if ((table.actionCounter || 0) > startCounter) {
                clearInterval(timer);
                resolve(true);
                return;
            }

            if (Date.now() - start >= timeoutMs) {
                clearInterval(timer);
                resolve(false);
            }
        }, 300);
    });
}

async function finishAndCleanup(channel, table, gameMessage, showdown = false) {
    const activePlayers = table.getActivePlayers();
    let winner = null;
    let winnerHand = null;

    if (activePlayers.length === 1) {
        winner = activePlayers[0];
    } else if (showdown && activePlayers.length > 1) {
        const scored = activePlayers
            .map(p => ({ player: p, hand: evaluateHand([...p.hole, ...table.community]) }))
            .sort((a, b) => b.hand.value - a.hand.value);

        winner = scored[0].player;
        winnerHand = scored[0].hand;
    }

    if (!winner) {
        await gameMessage.edit({ content: '⚠️ Poker hand ended without a winner.', embeds: [], components: [] }).catch(() => {});
        PokerTableManager.closeTable(table.tableId);
        return;
    }

    await economyManager.addMoney(table.guildId, winner.userId, table.pot);

    for (const p of table.getAllPlayers()) {
        if (p.userId === winner.userId) {
            await gameStatsManager.recordPoker(p.userId, 'win');
        } else {
            await gameStatsManager.recordPoker(p.userId, 'loss');
        }
    }

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(showdown ? '🎴 Showdown!' : '🎉 Hand Complete!')
        .setDescription(`${winner.username} wins **${table.pot} coins**!`)
        .addFields(
            { name: 'Community', value: formatCards(table.community), inline: false },
            { name: 'Players', value: getPlayerStatus(table), inline: false }
        );

    if (winnerHand) {
        embed.addFields({ name: 'Winning Hand', value: `${winnerHand.rank} (${formatCards(winnerHand.cards)})`, inline: false });
    }

    await gameMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
    PokerTableManager.closeTable(table.tableId);
}

async function updateGameDisplay(gameMessage, table, phase) {
    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle(`🎴 Texas Hold'em - ${phase}`)
        .addFields(
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Current Bet', value: `${table.currentBet} coins`, inline: true },
            { name: 'Turn', value: table.getCurrentPlayer()?.username || 'None', inline: true },
            { name: 'Community', value: formatCards(table.community), inline: false },
            { name: 'Players', value: getPlayerStatus(table), inline: false }
        );

    await gameMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
}

function getPlayerStatus(table) {
    return table.getAllPlayers().map(p => {
        const state = p.folded ? '❌ Folded' : '✅ In';
        return `${state} ${p.username} | bet: ${p.bet} | chips: ${p.chips}`;
    }).join('\n');
}

function formatCards(cards) {
    if (!cards || cards.length === 0) return 'None';
    return cards.map(c => `${c.rank}${c.suit}`).join(' ');
}

function evaluateHand(cards) {
    if (cards.length < 5) return { rank: 'Unknown', value: 0, cards: [] };

    const cardValue = (rank) => ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 }[rank]);

    const combinations = (arr, r) => {
        if (r === 0) return [[]];
        if (arr.length === 0) return [];
        const [head, ...tail] = arr;
        const withHead = combinations(tail, r - 1).map(c => [head, ...c]);
        const withoutHead = combinations(tail, r);
        return [...withHead, ...withoutHead];
    };

    const checkStraight = (sorted) => {
        if (sorted[0] - sorted[4] === 4 && new Set(sorted).size === 5) return true;
        return sorted[0] === 14 && sorted[1] === 5 && sorted[2] === 4 && sorted[3] === 3 && sorted[4] === 2;
    };

    const rankHand = (hand) => {
        const ranks = hand.map(c => cardValue(c.rank)).sort((a, b) => b - a);
        const suits = hand.map(c => c.suit);
        const flush = new Set(suits).size === 1;
        const straight = checkStraight(ranks);

        const count = {};
        ranks.forEach(r => (count[r] = (count[r] || 0) + 1));
        const groups = Object.entries(count).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

        const four = groups.find(g => g[1] === 4)?.[0];
        const three = groups.find(g => g[1] === 3)?.[0];
        const pairs = groups.filter(g => g[1] === 2).map(g => Number(g[0]));

        if (flush && straight && ranks[0] === 14 && ranks[4] === 10) return { rank: '🏆 Royal Flush', value: 10000 };
        if (flush && straight) return { rank: '🎴 Straight Flush', value: 9000 + ranks[0] };
        if (four) return { rank: '4️⃣ Four of a Kind', value: 8000 + Number(four) };
        if (three && pairs.length) return { rank: '🏠 Full House', value: 7000 + Number(three) };
        if (flush) return { rank: '🌊 Flush', value: 6000 + ranks[0] };
        if (straight) return { rank: '➡️ Straight', value: 5000 + ranks[0] };
        if (three) return { rank: '3️⃣ Three of a Kind', value: 4000 + Number(three) };
        if (pairs.length >= 2) return { rank: '👥 Two Pair', value: 3000 + Math.max(...pairs) };
        if (pairs.length === 1) return { rank: '👤 One Pair', value: 2000 + pairs[0] };
        return { rank: '🎯 High Card', value: 1000 + ranks[0] };
    };

    let best = null;
    let bestValue = -1;
    for (const combo of combinations(cards, 5)) {
        const r = rankHand(combo);
        if (r.value > bestValue) {
            bestValue = r.value;
            best = { ...r, cards: combo };
        }
    }

    return best;
}
