const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

const MIN_BET = 10;
const MAX_BET = 1_000_000;
const BOARD_SIZE = 4;
const TOTAL_TILES = BOARD_SIZE * BOARD_SIZE;
const HOUSE_EDGE = 0.96;
const GAME_TIMEOUT_MS = 120_000;

const activeMinesSessions = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Reveal safe tiles and cash out before hitting a mine!')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10)')
                .setRequired(true)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET))
        .addIntegerOption(option =>
            option.setName('mines')
                .setDescription('Number of mines (1-6, default 3)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(6)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const sessionKey = `${guildId}_${userId}`;

        let betRemoved = false;
        const bet = interaction.options.getInteger('bet');
        const mineCount = interaction.options.getInteger('mines') ?? 3;

        try {
            if (activeMinesSessions.has(sessionKey)) {
                return interaction.reply({ content: '⏳ You already have an active mines game. Finish it first.', ephemeral: true });
            }

            const userData = economyManager.getUserData(guildId, userId);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance.toLocaleString()} coins`, ephemeral: true });
            }

            activeMinesSessions.add(sessionKey);

            const removed = await economyManager.removeMoney(guildId, userId, bet);
            if (!removed) {
                return interaction.reply({ content: '❌ Could not place your bet. Please try again.', ephemeral: true });
            }
            betRemoved = true;

            await playMinesWithBet(interaction, bet, mineCount);
        } catch (error) {
            console.error('Error in slash mines command:', error);

            if (betRemoved) {
                await economyManager.addMoney(guildId, userId, bet);
            }

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while playing mines!', ephemeral: true });
            }
        } finally {
            activeMinesSessions.delete(sessionKey);
        }
    }
};

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
                    .setCustomId(`smines_tile_${index}`)
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
                .setCustomId('smines_cashout')
                .setLabel(`Cash Out (${cashoutAmount.toLocaleString()})`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💰')
                .setDisabled(disableAll || game.revealed.size === 0)
        )
    );

    return rows;
}

function createEmbed(interaction, game, title, statusText) {
    const safeRevealed = game.revealed.size;
    const safeTotal = TOTAL_TILES - game.mineCount;
    const currentMultiplier = calculateMultiplier(safeRevealed, game.mineCount);
    const cashoutAmount = Math.floor(game.bet * currentMultiplier);

    return new EmbedBuilder()
        .setColor(game.finished ? (game.result === 'win' ? 0x57f287 : 0xed4245) : 0x5865f2)
        .setTitle(title)
        .setThumbnail(interaction.user.displayAvatarURL())
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

async function playMinesWithBet(interaction, bet, mineCount) {
    const game = {
        bet,
        mineCount,
        mines: pickMines(mineCount),
        revealed: new Set(),
        finished: false,
        result: 'loss'
    };

    const introEmbed = createEmbed(
        interaction,
        game,
        '💣 Mines',
        'Pick a tile to start. Every safe tile increases your multiplier. Hit **Cash Out** anytime.'
    );

    const msg = await interaction.reply({ embeds: [introEmbed], components: createRows(game), withResponse: true });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: GAME_TIMEOUT_MS,
        filter: i => i.user.id === interaction.user.id
    });

    const finalizeCashout = async (reasonText) => {
        const multiplier = calculateMultiplier(game.revealed.size, game.mineCount);
        const payout = Math.floor(game.bet * multiplier);
        game.finished = true;
        game.result = 'win';

        await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        await gameStatsManager.recordMines(interaction.user.id, true);

        const embed = createEmbed(
            interaction,
            game,
            '💣 Mines - Cashed Out!',
            `${reasonText}\n🎉 You cashed out **${payout.toLocaleString()} coins**.`
        );

        await interaction.editReply({ embeds: [embed], components: createRows(game, { revealAll: true, disableAll: true }) });
    };

    const finalizeLoss = async (reasonText) => {
        game.finished = true;
        game.result = 'loss';

        await gameStatsManager.recordMines(interaction.user.id, false);

        const embed = createEmbed(
            interaction,
            game,
            '💣 Mines - Boom!',
            `${reasonText}\n💥 You lost **${game.bet.toLocaleString()} coins**.`
        );

        await interaction.editReply({ embeds: [embed], components: createRows(game, { revealAll: true, disableAll: true }) });
    };

    collector.on('collect', async i => {
        try {
            if (i.customId === 'smines_cashout') {
                if (game.revealed.size === 0) {
                    return i.reply({ content: '❌ Reveal at least one safe tile before cashing out.', ephemeral: true });
                }

                await i.deferUpdate();
                await finalizeCashout('💰 Smart move.');
                collector.stop('cashout');
                return;
            }

            const match = i.customId.match(/^smines_tile_(\d+)$/);
            if (!match) {
                return i.deferUpdate();
            }

            const tileIndex = Number.parseInt(match[1], 10);
            if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= TOTAL_TILES) {
                return i.deferUpdate();
            }

            if (game.revealed.has(tileIndex)) {
                return i.deferUpdate();
            }

            if (game.mines.has(tileIndex)) {
                await i.deferUpdate();
                await finalizeLoss('💣 You hit a mine.');
                collector.stop('boom');
                return;
            }

            game.revealed.add(tileIndex);

            const safeTiles = TOTAL_TILES - game.mineCount;
            if (game.revealed.size >= safeTiles) {
                await i.deferUpdate();
                await finalizeCashout('🏆 Perfect clear!');
                collector.stop('perfect');
                return;
            }

            const updatedEmbed = createEmbed(
                interaction,
                game,
                '💣 Mines',
                'Safe pick! Keep going or cash out now.'
            );

            await i.update({ embeds: [updatedEmbed], components: createRows(game) });
        } catch (error) {
            console.error('Error handling slash mines interaction:', error);
            if (!i.replied && !i.deferred) {
                await i.reply({ content: '❌ Something went wrong. The game is ending.', ephemeral: true }).catch(() => {});
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
            console.error('Error finalizing slash mines game:', error);
        }
    });
}
