const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags
} = require('discord.js');

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 18;
const SESSION_TIMEOUT_MS = 240000;

const PIECES = {
    I: {
        emoji: '🟦',
        shape: [
            [1, 1, 1, 1]
        ]
    },
    O: {
        emoji: '🟨',
        shape: [
            [1, 1],
            [1, 1]
        ]
    },
    T: {
        emoji: '🟪',
        shape: [
            [0, 1, 0],
            [1, 1, 1]
        ]
    },
    S: {
        emoji: '🟩',
        shape: [
            [0, 1, 1],
            [1, 1, 0]
        ]
    },
    Z: {
        emoji: '🟥',
        shape: [
            [1, 1, 0],
            [0, 1, 1]
        ]
    },
    J: {
        emoji: '🟫',
        shape: [
            [1, 0, 0],
            [1, 1, 1]
        ]
    },
    L: {
        emoji: '🟧',
        shape: [
            [0, 0, 1],
            [1, 1, 1]
        ]
    }
};

const PIECE_TYPES = Object.keys(PIECES);
const EMPTY_TILE = '⬛';
const activeTetrisSessions = new Set();

function cloneMatrix(matrix) {
    return matrix.map(row => [...row]);
}

function shuffle(array) {
    const items = [...array];

    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }

    return items;
}

function rotateMatrix(matrix) {
    const height = matrix.length;
    const width = matrix[0].length;
    const rotated = Array.from({ length: width }, () => Array(height).fill(0));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            rotated[x][height - 1 - y] = matrix[y][x];
        }
    }

    return rotated;
}

class TetrisGame {
    constructor() {
        this.board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.bag = [];
        this.nextType = this.drawPieceType();
        this.active = null;
        this.ended = !this.spawnPiece();
        this.lastEvent = this.ended
            ? 'No room for the first piece.'
            : 'Buttons move the piece. Gravity keeps pressure on.';
    }

    drawPieceType() {
        if (!this.bag.length) {
            this.bag = shuffle(PIECE_TYPES);
        }

        return this.bag.pop();
    }

    spawnPiece() {
        const type = this.nextType || this.drawPieceType();
        const baseShape = cloneMatrix(PIECES[type].shape);
        const x = Math.floor((BOARD_WIDTH - baseShape[0].length) / 2);
        const y = 0;

        this.nextType = this.drawPieceType();

        if (this.hasCollision(baseShape, x, y)) {
            this.active = null;
            return false;
        }

        this.active = { type, shape: baseShape, x, y };
        return true;
    }

    hasCollision(shape, posX, posY) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (!shape[y][x]) continue;

                const boardX = posX + x;
                const boardY = posY + y;

                if (boardX < 0 || boardX >= BOARD_WIDTH || boardY < 0 || boardY >= BOARD_HEIGHT) {
                    return true;
                }

                if (this.board[boardY][boardX]) {
                    return true;
                }
            }
        }

        return false;
    }

    move(dx, dy) {
        if (!this.active) return false;

        const nextX = this.active.x + dx;
        const nextY = this.active.y + dy;

        if (this.hasCollision(this.active.shape, nextX, nextY)) {
            return false;
        }

        this.active.x = nextX;
        this.active.y = nextY;
        return true;
    }

    rotate() {
        if (!this.active) return false;

        const rotated = rotateMatrix(this.active.shape);
        const kicks = [0, -1, 1, -2, 2];

        for (const kick of kicks) {
            if (!this.hasCollision(rotated, this.active.x + kick, this.active.y)) {
                this.active.shape = rotated;
                this.active.x += kick;
                return true;
            }
        }

        return false;
    }

    getTickMs() {
        return Math.max(450, 1800 - ((this.level - 1) * 120));
    }

    tick() {
        if (this.move(0, 1)) {
            this.lastEvent = 'Gravity moved the piece down.';
            return { gameOver: false };
        }

        return this.lockActivePiece('Gravity locked the piece.');
    }

    softDrop() {
        if (this.move(0, 1)) {
            this.score += 1;
            this.lastEvent = 'Soft drop.';
            return { gameOver: false };
        }

        return this.lockActivePiece('Soft drop locked the piece.');
    }

    hardDrop() {
        let droppedRows = 0;

        while (this.move(0, 1)) {
            droppedRows += 1;
        }

        this.score += droppedRows * 2;
        return this.lockActivePiece(
            droppedRows > 0
                ? `Hard dropped ${droppedRows} row${droppedRows === 1 ? '' : 's'}.`
                : 'Hard drop locked the piece.'
        );
    }

    lockActivePiece(reason) {
        if (!this.active) {
            this.ended = true;
            this.lastEvent = 'No active piece remains.';
            return { gameOver: true };
        }

        const { type, shape, x: baseX, y: baseY } = this.active;

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (!shape[y][x]) continue;
                this.board[baseY + y][baseX + x] = type;
            }
        }

        this.active = null;

        const clearedLines = this.clearLines();
        const spawned = this.spawnPiece();

        if (!spawned) {
            this.ended = true;
            this.lastEvent = clearedLines > 0
                ? `Cleared ${clearedLines} line${clearedLines === 1 ? '' : 's'}, then topped out.`
                : 'Board stacked to the top.';
            return { gameOver: true, clearedLines };
        }

        this.lastEvent = clearedLines > 0
            ? `Cleared ${clearedLines} line${clearedLines === 1 ? '' : 's'}!`
            : reason;

        return { gameOver: false, clearedLines };
    }

    clearLines() {
        const keptRows = this.board.filter(row => row.some(cell => !cell));
        const cleared = BOARD_HEIGHT - keptRows.length;

        if (!cleared) {
            return 0;
        }

        while (keptRows.length < BOARD_HEIGHT) {
            keptRows.unshift(Array(BOARD_WIDTH).fill(null));
        }

        this.board = keptRows;

        const levelBefore = this.level;
        const scoreByLines = [0, 100, 300, 500, 800];
        this.lines += cleared;
        this.score += (scoreByLines[cleared] || 1200) * levelBefore;
        this.level = Math.floor(this.lines / 10) + 1;

        return cleared;
    }

    getDisplayGrid() {
        const grid = this.board.map(row => [...row]);

        if (this.active) {
            const { type, shape, x: baseX, y: baseY } = this.active;

            for (let y = 0; y < shape.length; y++) {
                for (let x = 0; x < shape[y].length; x++) {
                    if (!shape[y][x]) continue;
                    grid[baseY + y][baseX + x] = type;
                }
            }
        }

        return grid;
    }
}

function renderBoard(game) {
    return game.getDisplayGrid()
        .map(row => row.map(cell => (cell ? PIECES[cell].emoji : EMPTY_TILE)).join(''))
        .join('\n');
}

function renderNextPiece(type) {
    const baseShape = PIECES[type].shape;
    const shape = Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => {
        const occupied = baseShape[y]?.[x] || 0;
        return occupied ? PIECES[type].emoji : EMPTY_TILE;
    }));

    return shape.map(row => row.join('')).join('\n');
}

function buildEmbed(game, playerMention, ended = false, endReason = '') {
    const color = ended ? 0xed4245 : 0x5865f2;
    const title = ended ? '🧱 Tetris - Game Over' : '🧱 Tetris';
    const description = `${renderBoard(game)}\n\n${ended ? endReason : game.lastEvent}`;

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'Score', value: `${game.score}`, inline: true },
            { name: 'Lines', value: `${game.lines}`, inline: true },
            { name: 'Level', value: `${game.level}`, inline: true },
            { name: 'Next', value: renderNextPiece(game.nextType), inline: true },
            { name: 'Player', value: playerMention, inline: true },
            { name: 'Speed', value: `${(game.getTickMs() / 1000).toFixed(2)}s`, inline: true }
        )
        .setFooter({ text: ended ? 'Start a new game with /tetris or your prefix command.' : 'Left/Right move, Rotate spins, Down soft drops, Drop slams.' });
}

function buildControls(disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tetris_left')
                .setLabel('Left')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('tetris_rotate')
                .setLabel('Rotate')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('tetris_right')
                .setLabel('Right')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tetris_down')
                .setLabel('Down')
                .setEmoji('⬇️')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('tetris_drop')
                .setLabel('Drop')
                .setEmoji('⏬')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('tetris_stop')
                .setLabel('Stop')
                .setEmoji('🛑')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        )
    ];
}

async function startTetrisSession({
    sessionKey,
    userId,
    playerMention,
    sendInitial,
    fetchReply,
    editMessage,
    onSessionConflict
}) {
    if (activeTetrisSessions.has(sessionKey)) {
        if (onSessionConflict) {
            await onSessionConflict();
        }
        return;
    }

    activeTetrisSessions.add(sessionKey);

    try {
        const game = new TetrisGame();

        const initialPayload = {
            embeds: [buildEmbed(game, playerMention)],
            components: buildControls(false)
        };

        const sendResult = await sendInitial(initialPayload);
        const message = fetchReply ? await fetchReply(sendResult) : sendResult;
        const updateReply = async (payload) => {
            if (editMessage) {
                return editMessage(payload, message);
            }

            return message.edit(payload);
        };

        await new Promise((resolve) => {
            let ended = false;
            let actionQueue = Promise.resolve();
            let tickTimeout = null;

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: SESSION_TIMEOUT_MS
            });

            const finalize = async (reasonText, stopReason) => {
                if (ended) return;
                ended = true;
                game.ended = true;

                if (tickTimeout) {
                    clearTimeout(tickTimeout);
                    tickTimeout = null;
                }

                collector.stop(stopReason);

                await updateReply({
                    embeds: [buildEmbed(game, playerMention, true, reasonText)],
                    components: buildControls(true)
                }).catch(() => {});
            };

            const scheduleTick = () => {
                if (ended) return;

                if (tickTimeout) {
                    clearTimeout(tickTimeout);
                }

                tickTimeout = setTimeout(() => {
                    queueAction(async () => {
                        const result = game.tick();

                        if (result.gameOver) {
                            await finalize('💥 The stack reached the top.', 'game_over');
                            return;
                        }

                        await updateReply({
                            embeds: [buildEmbed(game, playerMention)],
                            components: buildControls(false)
                        }).catch(() => {});
                    });
                }, game.getTickMs());
            };

            const queueAction = (handler) => {
                actionQueue = actionQueue
                    .then(async () => {
                        if (ended) return;
                        await handler();
                        if (!ended) scheduleTick();
                    })
                    .catch(async (error) => {
                        console.error('Error in Tetris session:', error);
                        await finalize('❌ Game ended due to an internal error.', 'error');
                    });

                return actionQueue;
            };

            collector.on('collect', async (interaction) => {
                if (!interaction.customId.startsWith('tetris_')) {
                    await interaction.deferUpdate().catch(() => {});
                    return;
                }

                if (interaction.user.id !== userId) {
                    await interaction.reply({
                        content: '❌ This Tetris game belongs to someone else.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                    return;
                }

                await interaction.deferUpdate().catch(() => {});

                queueAction(async () => {
                    if (interaction.customId === 'tetris_stop') {
                        await finalize('🛑 You stopped the game.', 'stopped');
                        return;
                    }

                    let result = { gameOver: false };

                    switch (interaction.customId) {
                        case 'tetris_left': {
                            const moved = game.move(-1, 0);
                            game.lastEvent = moved ? 'Moved left.' : 'Left wall or stack blocked the move.';
                            break;
                        }
                        case 'tetris_right': {
                            const moved = game.move(1, 0);
                            game.lastEvent = moved ? 'Moved right.' : 'Right wall or stack blocked the move.';
                            break;
                        }
                        case 'tetris_rotate': {
                            const rotated = game.rotate();
                            game.lastEvent = rotated ? 'Rotated the piece.' : 'No room to rotate there.';
                            break;
                        }
                        case 'tetris_down': {
                            result = game.softDrop();
                            break;
                        }
                        case 'tetris_drop': {
                            result = game.hardDrop();
                            break;
                        }
                        default:
                            game.lastEvent = 'Control ignored.';
                    }

                    if (result.gameOver) {
                        await finalize('💥 The stack reached the top.', 'game_over');
                        return;
                    }

                    await updateReply({
                        embeds: [buildEmbed(game, playerMention)],
                        components: buildControls(false)
                    }).catch(() => {});
                });
            });

            collector.on('end', async (_collected, reason) => {
                if (tickTimeout) {
                    clearTimeout(tickTimeout);
                    tickTimeout = null;
                }

                if (!ended) {
                    ended = true;
                    const reasonText = reason === 'time'
                        ? '⏰ Time is up.'
                        : '🛑 Game ended.';

                    await updateReply({
                        embeds: [buildEmbed(game, playerMention, true, reasonText)],
                        components: buildControls(true)
                    }).catch(() => {});
                }

                resolve();
            });

            scheduleTick();
        });
    } finally {
        activeTetrisSessions.delete(sessionKey);
    }
}

module.exports = {
    startTetrisSession
};