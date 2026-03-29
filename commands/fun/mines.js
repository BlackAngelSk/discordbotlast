const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

const MIN_BET = 10;
const MAX_BET = 1_000_000;
const BOARD_SIZE = 4; // 4x4 keeps room for control row
const TOTAL_TILES = BOARD_SIZE * BOARD_SIZE;
const DEFAULT_MINES = 3;
const MIN_MINES = 1;
const MAX_MINES = 6;
const HOUSE_EDGE = 0.96;
const GAME_TIMEOUT_MS = 120_000;

const activeMinesSessions = new Set();

module.exports = {
    name: 'mines',
    description: 'Play Mines! Reveal safe tiles and cash out before hitting a bomb.',
    usage: '!mines <bet|max|all> [mines 1-6]',
    aliases: ['minefield'],
    category: 'fun',
    async execute(message, args) {
        const guildId = message.guild.id;
        const userId = message.author.id;
        const sessionKey = `${guildId}_${userId}`;
        let wagerRemoved = false;
        let bet = 0;

        try {
            if (activeMinesSessions.has(sessionKey)) {
                return message.reply('⏳ You already have an active mines game. Finish it first.');
            }

            const userData = economyManager.getUserData(guildId, userId);
            bet = parseBetArg(args[0], userData.balance);
            const mineCount = parseMineCount(args[1]);

            if (!Number.isInteger(bet)) {
                return message.reply('❌ Please provide a valid bet amount (`number`, `max`, or `all`).\nUsage: `!mines <bet|max|all> [mines 1-6]`');
            }

            if (bet < MIN_BET) {
                return message.reply(`❌ Minimum bet is ${MIN_BET} coins.`);
            }

            if (bet > MAX_BET) {
                return message.reply(`❌ Maximum bet is ${MAX_BET.toLocaleString()} coins.`);
            }

            if (!Number.isInteger(mineCount) || mineCount < MIN_MINES || mineCount > MAX_MINES) {
                return message.reply(`❌ Mine count must be between ${MIN_MINES} and ${MAX_MINES}.\nUsage: \`!mines <bet|max|all> [mines 1-6]\``);
            }

            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance.toLocaleString()} coins`);
            }

            activeMinesSessions.add(sessionKey);

            const removed = await economyManager.removeMoney(guildId, userId, bet);
            if (!removed) {
                return message.reply('❌ Could not place your bet. Please try again.');
            }
            wagerRemoved = true;

            await playMinesWithBet(message, bet, mineCount);
        } catch (error) {
            console.error('Error in mines command:', error);

            if (wagerRemoved && bet > 0) {
                await economyManager.addMoney(guildId, userId, bet);
                return message.reply('❌ An error occurred while playing mines. Your bet was refunded.');
            }

            message.reply('❌ An error occurred while playing mines!');
        } finally {
            activeMinesSessions.delete(sessionKey);
        }
    }
};

function parseBetArg(rawArg, balance) {
    if (!rawArg) return null;
    const normalized = String(rawArg).toLowerCase();

    if (normalized === 'all' || normalized === 'max') {
        return Math.min(balance, MAX_BET);
    }

    const bet = Number.parseInt(rawArg, 10);
    return Number.isInteger(bet) ? bet : null;
}

function parseMineCount(rawArg) {
    if (!rawArg) return DEFAULT_MINES;
    const mineCount = Number.parseInt(rawArg, 10);
    return Number.isInteger(mineCount) ? mineCount : null;
}

function pickMines(mineCount) {
    const mines = new Set();
    while (mines.size < mineCount) {
        mines.add(Math.floor(Math.random() * TOTAL_TILES));
    }
    return mines;
}

function calculateMultiplier(revealedSafeTiles, mineCount) {
    if (revealedSafeTiles <= 0) return 1;

    let fairMultiplier = 1;
    const safeTiles = TOTAL_TILES - mineCount;

    for (let i = 0; i < revealedSafeTiles; i++) {
        const remainingTiles = TOTAL_TILES - i;
        const remainingSafeTiles = safeTiles - i;
        fairMultiplier *= remainingTiles / remainingSafeTiles;
    }

    return Math.max(1, fairMultiplier * HOUSE_EDGE);
}

function createRows(game, options = {}) {
    const revealAll = Boolean(options.revealAll);
    const disableAll = Boolean(options.disableAll);
    const rows = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
        const actionRow = new ActionRowBuilder();

        for (let col = 0; col < BOARD_SIZE; col++) {
            const index = row * BOARD_SIZE + col;
            const isMine = game.mines.has(index);
            const isRevealed = game.revealed.has(index);

            let emoji = '⬜';
            let style = ButtonStyle.Secondary;
            let disabled = disableAll;

            if (isRevealed && !isMine) {
                emoji = '💎';
                style = ButtonStyle.Success;
                disabled = true;
            } else if (revealAll && isMine) {
                emoji = '💣';
                style = ButtonStyle.Danger;
                disabled = true;
            } else if (revealAll && !isMine) {
                emoji = '💎';
                style = ButtonStyle.Success;
                disabled = true;
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mines_tile_${index}`)
                    .setStyle(style)
                    .setEmoji(emoji)
                    .setDisabled(disabled)
            );
        }

        rows.push(actionRow);
    }

    const currentMultiplier = calculateMultiplier(game.revealed.size, game.mineCount);
    const cashoutAmount = Math.floor(game.bet * currentMultiplier);

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mines_cashout')
                .setLabel(`Cash Out (${cashoutAmount.toLocaleString()})`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💰')
                .setDisabled(disableAll || game.revealed.size === 0)
        )
    );

    return rows;
}

function createEmbed(message, game, title, statusText) {
    const safeRevealed = game.revealed.size;
    const safeTotal = TOTAL_TILES - game.mineCount;
    const currentMultiplier = calculateMultiplier(safeRevealed, game.mineCount);
    const cashoutAmount = Math.floor(game.bet * currentMultiplier);

    return new EmbedBuilder()
        .setColor(game.finished ? (game.result === 'win' ? 0x57f287 : 0xed4245) : 0x5865f2)
        .setTitle(title)
        .setThumbnail(message.author.displayAvatarURL())
        .setDescription(statusText)
        .addFields(
            { name: '💰 Bet', value: `${game.bet.toLocaleString()} coins`, inline: true },
            { name: '💣 Mines', value: `${game.mineCount}`, inline: true },
            { name: '✅ Safe Picks', value: `${safeRevealed}/${safeTotal}`, inline: true },
            { name: '📈 Multiplier', value: `${currentMultiplier.toFixed(2)}x`, inline: true },
            { name: '💵 Cashout Value', value: `${cashoutAmount.toLocaleString()} coins`, inline: true },
            { name: '🏠 House Edge', value: `${Math.round((1 - HOUSE_EDGE) * 100)}%`, inline: true }
        )
        .setFooter({ text: 'Reveal tiles and cash out before hitting a mine.' });
}

async function playMinesWithBet(message, bet, mineCount) {
    const game = {
        bet,
        mineCount,
        mines: pickMines(mineCount),
        revealed: new Set(),
        finished: false,
        result: 'loss'
    };

    const introEmbed = createEmbed(
        message,
        game,
        '💣 Mines',
        'Pick a tile to start. Every safe tile increases your multiplier. Hit **Cash Out** anytime.'
    );

    const msg = await message.reply({ embeds: [introEmbed], components: createRows(game) });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: GAME_TIMEOUT_MS,
        filter: interaction => interaction.user.id === message.author.id
    });

    const finalizeCashout = async (reasonText) => {
        const multiplier = calculateMultiplier(game.revealed.size, game.mineCount);
        const payout = Math.floor(game.bet * multiplier);
        game.finished = true;
        game.result = 'win';

        await economyManager.addMoney(message.guild.id, message.author.id, payout);
        await gameStatsManager.recordMines(message.author.id, true);

        const embed = createEmbed(
            message,
            game,
            '💣 Mines - Cashed Out!',
            `${reasonText}\n🎉 You cashed out **${payout.toLocaleString()} coins**.`
        );

        await msg.edit({ embeds: [embed], components: createRows(game, { revealAll: true, disableAll: true }) });
    };

    const finalizeLoss = async (reasonText) => {
        game.finished = true;
        game.result = 'loss';

        await gameStatsManager.recordMines(message.author.id, false);

        const embed = createEmbed(
            message,
            game,
            '💣 Mines - Boom!',
            `${reasonText}\n💥 You lost **${game.bet.toLocaleString()} coins**.`
        );

        await msg.edit({ embeds: [embed], components: createRows(game, { revealAll: true, disableAll: true }) });
    };

    collector.on('collect', async interaction => {
        try {
            if (interaction.customId === 'mines_cashout') {
                if (game.revealed.size === 0) {
                    return interaction.reply({ content: '❌ Reveal at least one safe tile before cashing out.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();
                await finalizeCashout('💰 Smart move.');
                collector.stop('cashout');
                return;
            }

            const match = interaction.customId.match(/^mines_tile_(\d+)$/);
            if (!match) {
                return interaction.deferUpdate();
            }

            const tileIndex = Number.parseInt(match[1], 10);
            if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= TOTAL_TILES) {
                return interaction.deferUpdate();
            }

            if (game.revealed.has(tileIndex)) {
                return interaction.deferUpdate();
            }

            if (game.mines.has(tileIndex)) {
                await interaction.deferUpdate();
                await finalizeLoss('💣 You hit a mine.');
                collector.stop('boom');
                return;
            }

            game.revealed.add(tileIndex);

            const safeTiles = TOTAL_TILES - game.mineCount;
            if (game.revealed.size >= safeTiles) {
                await interaction.deferUpdate();
                await finalizeCashout('🏆 Perfect clear!');
                collector.stop('perfect');
                return;
            }

            const updatedEmbed = createEmbed(
                message,
                game,
                '💣 Mines',
                'Safe pick! Keep going or cash out now.'
            );

            await interaction.update({ embeds: [updatedEmbed], components: createRows(game) });
        } catch (error) {
            console.error('Error handling mines interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Something went wrong. The game is ending.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            collector.stop('error');
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (game.finished) return;

        try {
            if (reason === 'time' && game.revealed.size > 0) {
                await finalizeCashout('⏰ Time ran out. Auto cashout applied.');
            } else {
                await finalizeLoss(reason === 'time' ? '⏰ Time ran out before cashout.' : 'Game ended unexpectedly.');
            }
        } catch (error) {
            console.error('Error finalizing mines game:', error);
        }
    });
}