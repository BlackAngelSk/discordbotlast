const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const { PokerTableManager } = require('../../utils/pokerTableManager');
const { memberHasBetaAccess, getBetaRoleName } = require('../../utils/betaAccess');
const {
    pokerCommunityAttachment,
    pokerCommunityCardAttachments,
    pokerHandAttachment,
    pokerHandCardAttachments,
    supportsBoardImageRendering
} = require('../../utils/cardBoardRenderer');

module.exports = {
    name: 'poker',
    description: 'Play multiplayer Texas Hold\'em Poker!',
    usage: '!poker host <blind> [buyin] | !poker join <blind> | !poker start | !poker status | !poker leave',
    aliases: ['holdem', 'txpoker'],
    category: 'fun',
    beta: true,
    async execute(message, args) {
        try {
            if (!memberHasBetaAccess(message.member)) {
                return message.reply(`❌ This is a beta command. You need the \`${getBetaRoleName()}\` role.`);
            }

            PokerTableManager.cleanupInactiveTables(10 * 60 * 1000);

            const subcommand = args[0]?.toLowerCase();
            if (!subcommand) {
                return message.reply('❌ Usage: `!poker host <bet>` | `!poker join <bet>` | `!poker start` | `!poker status` | `!poker leave`');
            }

            if (subcommand === 'host') return hostPoker(message, args);
            if (subcommand === 'join') return joinPoker(message, args);
            if (subcommand === 'start') return startHostedPoker(message);
            if (subcommand === 'status') return pokerStatus(message);
            if (subcommand === 'leave') return leavePoker(message);

            return message.reply('❌ Unknown subcommand. Use: host, join, start, status, leave');
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

    const buyInArg = parseInt(args[2], 10);
    const defaultBuyIn = bet * 20;
    const buyIn = Number.isFinite(buyInArg) && buyInArg > 0 ? buyInArg : defaultBuyIn;
    if (buyIn < bet * 2) {
        return message.reply(`❌ Buy-in must be at least ${bet * 2} coins (2x blind).`);
    }

    if (PokerTableManager.getUserTable(message.author.id)) {
        return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');
    }

    const userData = economyManager.getUserData(message.guild.id, message.author.id);
    const betaInfinite = isBetaInfinite(message);
    if (!betaInfinite && userData.balance < buyIn) {
        return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
    }

    const table = PokerTableManager.createTable(message.guild.id, message.channel.id, bet, 6);
    table.hostId = message.author.id;
    table.betaInfinite = betaInfinite;
    table.buyIn = buyIn;

    const added = PokerTableManager.addPlayerToTable(table.tableId, message.author.id, message.author.username, buyIn);
    if (!added) return message.reply('❌ Failed to create poker table.');

    if (!betaInfinite) {
        await economyManager.removeMoney(message.guild.id, message.author.id, buyIn);
    }

    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle('🎴 Poker Table Created')
        .setDescription(`${message.author} is hosting a poker table!`)
        .addFields(
            { name: 'Blind', value: `${bet} coins`, inline: true },
            { name: 'Buy-in', value: `${buyIn} coins`, inline: true },
            { name: 'Players', value: '1/6', inline: true },
            { name: 'Join', value: `Use \`!poker join ${bet}\` or click button.`, inline: false },
            { name: 'Start', value: 'Host can click **Start Game** or run `!poker start`.', inline: false }
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

    if (PokerTableManager.getUserTable(message.author.id)) {
        return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');
    }

    const userData = economyManager.getUserData(message.guild.id, message.author.id);
    const betaInfinite = isBetaInfinite(message);

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

    const tableBuyIn = getTableBuyIn(table);
    if (!betaInfinite && userData.balance < tableBuyIn) {
        return message.reply(`❌ You don't have enough coins! Need ${tableBuyIn}, balance: ${userData.balance}`);
    }

    const added = PokerTableManager.addPlayerToTable(table.tableId, message.author.id, message.author.username, tableBuyIn);
    if (!added) return message.reply('❌ Could not join this table.');

    if (!table.betaInfinite) {
        await economyManager.removeMoney(message.guild.id, message.author.id, tableBuyIn);
    }
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
    if (table.gameStarted) return message.reply('❌ You cannot leave while a hand is running.');

    const wasHost = table.hostId === message.author.id;
    const buyIn = getTableBuyIn(table);

    PokerTableManager.removePlayerFromTable(message.author.id);
    if (!table.betaInfinite) {
        await economyManager.addMoney(message.guild.id, message.author.id, buyIn);
    }

    if (wasHost) {
        PokerTableManager.closeTable(table.tableId);
        return message.reply('✅ You left and closed the hosted table. Buy-in refunded.');
    }

    return message.reply('✅ You left the table. Buy-in refunded.');
}

async function pokerStatus(message) {
    const table = PokerTableManager.getUserTable(message.author.id);
    if (!table) return message.reply('❌ You are not in a poker game!');

    const turnAvatarUrl = await getTurnAvatarUrl(message.guild, table);
    const embed = buildStateEmbed(table, `Current turn: **${table.getCurrentPlayer()?.username || 'None'}**`, turnAvatarUrl);
    return message.reply(withCommunityBoard(embed, table));
}

function withCommunityBoard(embed, table) {
    const board = pokerCommunityAttachment(table.community, 'poker-board.png', { useAssetImages: false });
    
    if (board) {
        embed.setImage('attachment://poker-board.png');
        return { embeds: [embed], files: [board] };
    }

    return { embeds: [embed] };
}

function withPrivateHand(embed, cards, playerName) {
    const handFile = pokerHandAttachment(cards, playerName, 'poker-hand.png', { useAssetImages: false });
    
    if (handFile) {
        embed.setImage('attachment://poker-hand.png');
        return { embeds: [embed], files: [handFile] };
    }

    return { embeds: [embed] };
}

function setupTableLobby(message, table, tableMsg) {
    const collector = tableMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
    let startingGame = false;

    collector.on('collect', async (interaction) => {
        if (interaction.customId === `poker_join_${table.tableId}`) {
            const t = PokerTableManager.getTable(table.tableId);
            if (!t || t.gameStarted) return interaction.reply({ content: '❌ Table not available.', flags: MessageFlags.Ephemeral });

            if (!memberHasBetaAccess(interaction.member)) {
                return interaction.reply({ content: `❌ Beta only. You need the \`${getBetaRoleName()}\` role.`, flags: MessageFlags.Ephemeral });
            }

            if (PokerTableManager.getUserTable(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are already in a poker table.', flags: MessageFlags.Ephemeral });
            }

            const userData = economyManager.getUserData(message.guild.id, interaction.user.id);
            const tableBuyIn = getTableBuyIn(t);
            if (!t.betaInfinite && userData.balance < tableBuyIn) {
                return interaction.reply({ content: `❌ You don't have enough coins (${tableBuyIn} needed).`, flags: MessageFlags.Ephemeral });
            }

            const added = PokerTableManager.addPlayerToTable(t.tableId, interaction.user.id, interaction.user.username, tableBuyIn);
            if (!added) {
                return interaction.reply({ content: '❌ Could not join table.', flags: MessageFlags.Ephemeral });
            }

            if (!t.betaInfinite) {
                await economyManager.removeMoney(message.guild.id, interaction.user.id, tableBuyIn);
            }
            await interaction.reply({ content: '✅ Joined poker table!', flags: MessageFlags.Ephemeral });
            await updateTableLobby(tableMsg, t);
            return;
        }

        if (interaction.customId === `poker_start_${table.tableId}`) {
            const t = PokerTableManager.getTable(table.tableId);
            if (!t) return interaction.reply({ content: '❌ Table not found.', flags: MessageFlags.Ephemeral });
            if (!memberHasBetaAccess(interaction.member)) {
                return interaction.reply({ content: `❌ Beta only. You need the \`${getBetaRoleName()}\` role.`, flags: MessageFlags.Ephemeral });
            }
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

        if (!t.betaInfinite) {
            const tableBuyIn = getTableBuyIn(t);
            for (const p of t.getAllPlayers()) {
                await economyManager.addMoney(t.guildId, p.userId, tableBuyIn);
            }
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
            { name: 'Blind', value: `${table.minBet} coins`, inline: true },
            { name: 'Buy-in', value: `${getTableBuyIn(table)} coins`, inline: true },
            { name: 'Players', value: `${table.getTotalPlayers()}/${table.maxPlayers}`, inline: true },
            { name: 'List', value: players, inline: false }
        );

    await tableMsg.edit({ embeds: [embed] }).catch(() => {});
}

async function runGameLoop(channel, table, tableMsg = null) {
    if (!table.startGame()) return channel.send('❌ Could not start poker game.');

    for (const p of table.getAllPlayers()) {
        const member = await channel.guild.members.fetch(p.userId).catch(() => null);
        if (!member) continue;
        const hand = p.hole.map(c => `${c.rank}${c.suit}`).join(' ');
        const dmEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🃏 Your Poker Hand')
            .setDescription(`Your cards: **${hand}**\nStack: **${p.chips}**`)
            .setFooter({ text: 'Keep this private.' });
        member.send(withPrivateHand(dmEmbed, p.hole, p.username)).catch(() => {});
    }

    const gameMessage = tableMsg || await channel.send('🎴 Poker game started!');

    await updateGameDisplay(gameMessage, table, 'PREFLOP');
    await conductBettingRound(channel, table, gameMessage, 'PREFLOP');
    if (table.getActivePlayers().length <= 1) return finishAndCleanup(table, gameMessage);

    table.dealFlop();
    await updateGameDisplay(gameMessage, table, 'FLOP');
    await conductBettingRound(channel, table, gameMessage, 'FLOP');
    if (table.getActivePlayers().length <= 1) return finishAndCleanup(table, gameMessage);

    table.dealTurn();
    await updateGameDisplay(gameMessage, table, 'TURN');
    await conductBettingRound(channel, table, gameMessage, 'TURN');
    if (table.getActivePlayers().length <= 1) return finishAndCleanup(table, gameMessage);

    table.dealRiver();
    await updateGameDisplay(gameMessage, table, 'RIVER');
    await conductBettingRound(channel, table, gameMessage, 'RIVER');

    return finishAndCleanup(table, gameMessage, true);
}

async function conductBettingRound(channel, table, gameMessage, phase) {
    const actedThisRound = new Set();
    const actionablePlayers = () => table.getActivePlayers().filter(p => !p.allIn);

    while (actionablePlayers().length > 1) {
        const current = table.getCurrentPlayer();
        if (!current) break;

        if (current.folded || current.allIn) {
            table.nextPlayer();
            continue;
        }

        const turnAvatarUrl = await getTurnAvatarUrl(channel.guild, table);
        const actionEmbed = buildStateEmbed(table, `**${current.username}** to act (${phase})`, turnAvatarUrl);
        const actionPayload = withCommunityBoard(actionEmbed, table);
        await gameMessage.edit({ ...actionPayload, components: [buildActionRow(table, current)] }).catch(() => {});

        const result = await waitForTurnAction(gameMessage, table, current, 30000);
        if (!result.acted) {
            table.playerFold(current.userId);
            actedThisRound.add(current.userId);
            await channel.send(`⏱️ ${current.username} did not act in time and folded.`);
        } else {
            if (result.raised) {
                actedThisRound.clear();
                actedThisRound.add(current.userId);
            } else {
                actedThisRound.add(current.userId);
            }
        }

        const players = actionablePlayers();
        if (players.length <= 1) break;

        if (table.currentBet === 0) {
            // No open bet: everyone must act once (check/bet/fold) before moving street.
            if (players.every(p => actedThisRound.has(p.userId))) break;
            table.nextPlayer();
            continue;
        }

        // Open bet: all actionable players must have acted and bets must be matched.
        if (table.isRoundComplete() && players.every(p => actedThisRound.has(p.userId) || p.allIn)) {
            break;
        }

        table.nextPlayer();
    }

    await gameMessage.edit({ components: [] }).catch(() => {});
}

function buildActionRow(table, currentPlayer) {
    const toCall = Math.max(0, table.currentBet - currentPlayer.bet);

    const raiseMinTarget = Math.max(table.currentBet + table.minBet, table.minBet);
    const raiseBigTarget = raiseMinTarget + table.minBet;
    const allInTarget = currentPlayer.bet + currentPlayer.chips;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`poker_act_${table.tableId}_fold`).setLabel('Fold').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`poker_act_${table.tableId}_${toCall > 0 ? 'call' : 'check'}`).setLabel(toCall > 0 ? `Call ${toCall}` : 'Check').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`poker_act_${table.tableId}_raise_${raiseMinTarget}`).setLabel(`Raise ${raiseMinTarget}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`poker_act_${table.tableId}_raise_${raiseBigTarget}`).setLabel(`Raise ${raiseBigTarget}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`poker_act_${table.tableId}_raise_${allInTarget}`).setLabel('All-in').setStyle(ButtonStyle.Secondary).setDisabled(currentPlayer.chips <= 0 || allInTarget <= table.currentBet)
    );
}

async function waitForTurnAction(gameMessage, table, currentPlayer, timeoutMs) {
    return new Promise((resolve) => {
        const collector = gameMessage.createMessageComponentCollector({
            time: timeoutMs,
            filter: (i) => i.customId.startsWith(`poker_act_${table.tableId}_`)
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== currentPlayer.userId) {
                await interaction.reply({ content: `❌ It's ${currentPlayer.username}'s turn.`, flags: MessageFlags.Ephemeral });
                return;
            }

            const actionPart = interaction.customId.replace(`poker_act_${table.tableId}_`, '');
            const beforeBet = table.currentBet;
            const result = applyTurnAction(table, currentPlayer, actionPart);

            if (!result.ok) {
                await interaction.reply({ content: `❌ ${result.error}`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deferUpdate().catch(() => {});
            collector.stop('acted');

            const raised = table.currentBet > beforeBet;
            resolve({ acted: true, raised, action: actionPart });
        });

        collector.on('end', (_c, reason) => {
            if (reason !== 'acted') resolve({ acted: false, raised: false, action: null });
        });
    });
}

function applyTurnAction(table, currentPlayer, actionPart) {
    if (actionPart === 'fold') return { ok: table.playerFold(currentPlayer.userId) };

    if (actionPart === 'check') {
        if (!table.playerCheck(currentPlayer.userId)) return { ok: false, error: 'Cannot check, there is an uncalled bet.' };
        return { ok: true };
    }

    if (actionPart === 'call') {
        const toCall = Math.max(0, table.currentBet - currentPlayer.bet);
        if (toCall <= 0) return { ok: false, error: 'Nothing to call.' };
        return { ok: table.playerCall(currentPlayer.userId) };
    }

    if (actionPart.startsWith('raise_')) {
        const target = parseInt(actionPart.split('_')[1], 10);
        if (!target || target <= table.currentBet) return { ok: false, error: `Raise must be above current bet (${table.currentBet}).` };

        const contribute = target - currentPlayer.bet;
        if (contribute <= 0) return { ok: false, error: 'Invalid raise amount.' };

        return { ok: table.playerBet(currentPlayer.userId, contribute) };
    }

    return { ok: false, error: 'Unknown action.' };
}

async function finishAndCleanup(table, gameMessage, showdown = false) {
    const activePlayers = table.getActivePlayers();
    let winners = [];
    let winnerHand = null;

    if (activePlayers.length === 1) {
        winners = [activePlayers[0]];
    } else if (showdown && activePlayers.length > 1) {
        const scored = activePlayers
            .map(p => ({ player: p, hand: evaluateHand([...p.hole, ...table.community]) }))
            .sort((a, b) => compareHands(b.hand, a.hand));

        winnerHand = scored[0].hand;
        winners = scored.filter(s => compareHands(s.hand, winnerHand) === 0).map(s => s.player);
    }

    if (!winners.length) {
        await gameMessage.edit({ content: '⚠️ Poker hand ended without a winner.', embeds: [], components: [] }).catch(() => {});
        PokerTableManager.closeTable(table.tableId);
        return;
    }

    if (!table.betaInfinite) {
        const split = Math.floor(table.pot / winners.length);
        let remainder = table.pot % winners.length;
        for (const w of winners) {
            const payout = split + (remainder > 0 ? 1 : 0);
            remainder = Math.max(0, remainder - 1);
            await economyManager.addMoney(table.guildId, w.userId, payout);
        }
    }

    const winnerIds = new Set(winners.map(w => w.userId));
    for (const p of table.getAllPlayers()) {
        if (winners.length > 1 && winnerIds.has(p.userId)) {
            await gameStatsManager.recordPoker(p.userId, 'tie');
        } else if (winnerIds.has(p.userId)) {
            await gameStatsManager.recordPoker(p.userId, 'win');
        } else {
            await gameStatsManager.recordPoker(p.userId, 'loss');
        }
    }

    const reveal = table.getAllPlayers().map(p => `**${p.username}**: ${formatCards(p.hole)}`).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(showdown ? '🎴 Showdown!' : '🎉 Hand Complete!')
        .setDescription(
            winners.length > 1
                ? `🤝 Tie between **${winners.map(w => w.username).join(', ')}**\nPot split: **${Math.floor(table.pot / winners.length)}** each`
                : `${winners[0].username} wins **${table.pot} coins**!`
        )
        .addFields(
            { name: 'Community Cards', value: formatCards(table.community), inline: false },
            { name: 'Player Cards', value: reveal || 'N/A', inline: false }
        );

    const winnerMember = await gameMessage.guild.members.fetch(winners[0].userId).catch(() => null);
    if (winnerMember) {
        embed.setThumbnail(winnerMember.displayAvatarURL({ extension: 'png', size: 256 }));
    }

    if (winnerHand) embed.addFields({ name: 'Winning Hand', value: `${winnerHand.rank} (${formatCards(winnerHand.cards)})`, inline: false });

    const payload = withCommunityBoard(embed, table);
    await gameMessage.edit({ ...payload, components: [] }).catch(() => {});
    PokerTableManager.closeTable(table.tableId);
}

function isBetaInfinite(message) {
    return !!message?.betaInfiniteBalance;
}

async function updateGameDisplay(gameMessage, table, phase) {
    const turnAvatarUrl = await getTurnAvatarUrl(gameMessage.guild, table);
    const embed = buildStateEmbed(table, `Phase: **${phase}**`, turnAvatarUrl);
    const payload = withCommunityBoard(embed, table);
    await gameMessage.edit({ ...payload, components: [] }).catch(() => {});
}

function buildStateEmbed(table, subtitle, turnAvatarUrl = null) {
    const embed = new EmbedBuilder()
        .setColor(0x228b22)
        .setTitle('🎴 Texas Hold\'em')
        .setDescription(subtitle)
        .addFields(
            { name: 'Pot', value: `${table.pot} coins`, inline: true },
            { name: 'Current Bet', value: `${table.currentBet} coins`, inline: true },
            { name: 'Turn', value: table.getCurrentPlayer()?.username || 'None', inline: true },
            { name: 'Community', value: formatCards(table.community), inline: false },
            { name: 'Players', value: getPlayerStatus(table), inline: false }
        )
        .setFooter({ text: 'Private hole cards were sent by DM.' });

    if (turnAvatarUrl) {
        embed.setThumbnail(turnAvatarUrl);
    }

    return embed;
}

async function getTurnAvatarUrl(guild, table) {
    const current = table.getCurrentPlayer();
    if (!guild || !current) return null;

    const member = await guild.members.fetch(current.userId).catch(() => null);
    if (!member) return null;

    return member.displayAvatarURL({ extension: 'png', size: 256 });
}

function getPlayerStatus(table) {
    return table.getAllPlayers().map(p => {
        const state = p.folded ? '❌ Folded' : p.allIn ? '🟡 All-in' : '✅ In';
        return `${state} ${p.username} | bet: ${p.bet} | chips: ${p.chips}`;
    }).join('\n');
}

function formatCards(cards) {
    if (!cards || cards.length === 0) return 'None';
    return cards.map(c => `${c.rank}${c.suit}`).join(' ');
}

function getTableBuyIn(table) {
    return table?.buyIn && table.buyIn > 0 ? table.buyIn : table.minBet * 20;
}

function evaluateHand(cards) {
    if (cards.length < 5) return { rank: 'Unknown', value: 0, cards: [] };

    const cardValue = (rank) => ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 }[rank]);
    const combinations = (arr, r) => {
        if (r === 0) return [[]];
        if (arr.length === 0) return [];
        const [head, ...tail] = arr;
        return [...combinations(tail, r - 1).map(c => [head, ...c]), ...combinations(tail, r)];
    };

    const checkStraight = (sorted) => (sorted[0] - sorted[4] === 4 && new Set(sorted).size === 5) || (sorted[0] === 14 && sorted[1] === 5 && sorted[2] === 4 && sorted[3] === 3 && sorted[4] === 2);

    const rankHand = (hand) => {
        const ranks = hand.map(c => cardValue(c.rank)).sort((a, b) => b - a);
        const suits = hand.map(c => c.suit);
        const flush = new Set(suits).size === 1;
        const straight = checkStraight(ranks);
        const straightHigh = (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) ? 5 : ranks[0];

        const counts = {};
        for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
        const groups = Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]));

        const four = Number(groups.find(g => g[1] === 4)?.[0] || 0);
        const three = Number(groups.find(g => g[1] === 3)?.[0] || 0);
        const pairs = groups.filter(g => g[1] === 2).map(g => Number(g[0]));
        const singles = groups.filter(g => g[1] === 1).map(g => Number(g[0])).sort((a, b) => b - a);

        if (flush && straight && straightHigh === 14 && ranks.includes(10)) return { rank: '🏆 Royal Flush', value: 10000, tiebreak: [14] };
        if (flush && straight) return { rank: '🎴 Straight Flush', value: 9000, tiebreak: [straightHigh] };
        if (four) return { rank: '4️⃣ Four of a Kind', value: 8000, tiebreak: [four, singles[0] || 0] };
        if (three && pairs.length) return { rank: '🏠 Full House', value: 7000, tiebreak: [three, pairs[0]] };
        if (flush) return { rank: '🌊 Flush', value: 6000, tiebreak: [...ranks] };
        if (straight) return { rank: '➡️ Straight', value: 5000, tiebreak: [straightHigh] };
        if (three) return { rank: '3️⃣ Three of a Kind', value: 4000, tiebreak: [three, ...singles] };
        if (pairs.length >= 2) {
            const hi = Math.max(...pairs);
            const lo = Math.min(...pairs);
            return { rank: '👥 Two Pair', value: 3000, tiebreak: [hi, lo, singles[0] || 0] };
        }
        if (pairs.length === 1) return { rank: '👤 One Pair', value: 2000, tiebreak: [pairs[0], ...singles] };
        return { rank: '🎯 High Card', value: 1000, tiebreak: [...ranks] };
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

function compareHands(a, b) {
    if (a.value !== b.value) return a.value - b.value;
    const at = a.tiebreak || [];
    const bt = b.tiebreak || [];
    const len = Math.max(at.length, bt.length);
    for (let i = 0; i < len; i++) {
        const av = at[i] ?? 0;
        const bv = bt[i] ?? 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}
