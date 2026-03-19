const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const BOARD_TEMPLATE = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   # G  G #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......P .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
];

const BOARD_WIDTH = Math.max(...BOARD_TEMPLATE.map(row => row.length));
const MAX_GHOSTS = 4;
const POWER_ORB_TURNS = 13;

const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

module.exports = {
    name: 'pacman',
    description: 'Play a Pacman-style arcade mini game with buttons!',
    usage: '!pacman',
    aliases: ['arcade', 'pac'],
    category: 'fun',
    async execute(message) {
        try {
            await playPacmanGame(message);
        } catch (error) {
            console.error('Error in pacman command:', error);
            await message.reply('❌ Could not start Pacman right now. Try again in a moment.');
        }
    }
};

function cloneBoard() {
    const board = BOARD_TEMPLATE.map(row => row.padEnd(BOARD_WIDTH, '#').split(''));
    let player = { x: 1, y: 1 };
    const ghosts = [];

    for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board[y].length; x++) {
            if (board[y][x] === 'P') {
                player = { x, y };
                board[y][x] = ' ';
            } else if (board[y][x] === 'G') {
                ghosts.push({ x, y });
                board[y][x] = ' ';
            }
        }
    }

    const fallbackSpawns = [
        { x: 12, y: 14 },
        { x: 15, y: 14 },
        { x: 13, y: 14 },
        { x: 14, y: 14 },
        { x: 13, y: 15 },
        { x: 14, y: 15 }
    ];

    for (const spot of fallbackSpawns) {
        if (ghosts.length >= MAX_GHOSTS) break;
        const occupied = ghosts.some(g => g.x === spot.x && g.y === spot.y);
        if (occupied) continue;
        if (!isGhostBlocked(board, spot.x, spot.y, false)) {
            ghosts.push({ x: spot.x, y: spot.y });
        }
    }

    while (ghosts.length < MAX_GHOSTS) {
        ghosts.push({ x: 13, y: 14 });
    }

    return { board, player, ghosts: ghosts.slice(0, MAX_GHOSTS) };
}

function isWall(board, x, y) {
    if (y < 0 || y >= board.length || x < 0 || x >= board[0].length) return true;
    const cell = board[y][x];
    if (!cell) return true;
    return cell === '#' || cell === '-';
}

function isGhostBlocked(board, x, y, released) {
    if (y < 0 || y >= board.length || x < 0 || x >= board[0].length) return true;
    const cell = board[y][x];
    if (!cell) return true;
    if (cell === '#') return true;
    if (cell === '-' && released) return true;
    return false;
}

function countPellets(board) {
    let pellets = 0;
    for (const row of board) {
        for (const cell of row) {
            if (cell === '.' || cell === 'o') pellets++;
        }
    }
    return pellets;
}

function renderBoard(board, player, ghosts, ghostStates, powerTurnsRemaining) {
    let output = '';
    const symbols = {
        crash: 'X',
        player: 'P',
        ghost: 'G',
        frightenedGhost: 'F',
        wall: '▓',
        pellet: '•',
        power: 'O',
        empty: ' '
    };

    for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board[0].length; x++) {
            let symbol = symbols.empty;

            const playerHere = player.x === x && player.y === y;
            const ghostCountHere = ghosts.reduce((count, ghost) => {
                return count + (ghost.x === x && ghost.y === y ? 1 : 0);
            }, 0);
            const ghostHere = ghostCountHere > 0;

            if (playerHere && ghostHere) {
                symbol = symbols.crash;
            } else if (playerHere) {
                symbol = symbols.player;
            } else if (ghostHere) {
                const frightenedHere = ghosts.some((ghost, index) => (
                    ghost.x === x && ghost.y === y && ghostStates[index]?.frightened
                ));
                if (frightenedHere && powerTurnsRemaining > 0) {
                    symbol = ghostCountHere > 1 ? 'f' : symbols.frightenedGhost;
                } else {
                    symbol = ghostCountHere > 1 ? 'W' : symbols.ghost;
                }
            } else if (board[y][x] === '#') {
                symbol = symbols.wall;
            } else if (board[y][x] === '.') {
                symbol = symbols.pellet;
            } else if (board[y][x] === 'o') {
                symbol = symbols.power;
            }

            output += `${symbol} `;
        }
        output += '\n';
    }

    return `\`\`\`\n${output}\`\`\``;
}

function isPlayerCaught(player, ghosts) {
    return ghosts.some(ghost => ghost.x === player.x && ghost.y === player.y);
}

function respawnGhost(ghost, ghostState) {
    ghost.x = ghostState.spawn.x;
    ghost.y = ghostState.spawn.y;
    ghostState.released = false;
    ghostState.frightened = false;
}

function resolvePlayerGhostCollision(player, ghosts, ghostStates, powerTurnsRemaining) {
    const collidedIndexes = ghosts
        .map((ghost, index) => (ghost.x === player.x && ghost.y === player.y ? index : -1))
        .filter(index => index !== -1);

    if (!collidedIndexes.length) {
        return { playerCaught: false, ghostsEaten: 0 };
    }

    if (powerTurnsRemaining > 0) {
        let ghostsEaten = 0;
        for (const index of collidedIndexes) {
            respawnGhost(ghosts[index], ghostStates[index]);
            ghostsEaten += 1;
        }
        return { playerCaught: false, ghostsEaten };
    }

    return { playerCaught: true, ghostsEaten: 0 };
}

function getNextPosition(board, x, y, direction) {
    const delta = DIRECTIONS[direction];
    if (!delta) return { x, y, wrapped: false };

    let nextX = x + delta.x;
    let nextY = y + delta.y;
    let wrapped = false;

    // Classic tunnel behavior: horizontal wrap only.
    if (nextY >= 0 && nextY < board.length) {
        if (nextX < 0) {
            nextX = board[0].length - 1;
            wrapped = true;
        } else if (nextX >= board[0].length) {
            nextX = 0;
            wrapped = true;
        }
    }

    return { x: nextX, y: nextY, wrapped };
}

function tryMove(entity, board, direction) {
    const next = getNextPosition(board, entity.x, entity.y, direction);

    if (!isWall(board, next.x, next.y)) {
        entity.x = next.x;
        entity.y = next.y;
    }
}

function tryMoveGhost(entity, board, direction, ghostState) {
    const next = getNextPosition(board, entity.x, entity.y, direction);

    if (isGhostBlocked(board, next.x, next.y, ghostState.released)) return;

    entity.x = next.x;
    entity.y = next.y;

    // When ghost reaches the gate for the first time, mark released and nudge it out.
    if (!ghostState.released && board[entity.y][entity.x] === '-') {
        ghostState.released = true;
        const outY = entity.y - 1;
        if (!isGhostBlocked(board, entity.x, outY, ghostState.released)) {
            entity.y = outY;
        }
    }
}

function getGhostMove(board, ghost, player, ghostState, powerTurnsRemaining) {
    const options = Object.keys(DIRECTIONS).filter((key) => {
        const next = getNextPosition(board, ghost.x, ghost.y, key);
        return !isGhostBlocked(board, next.x, next.y, ghostState.released);
    });

    if (!options.length) return null;

    // While in the house, move toward the nearest gate tile deterministically.
    if (!ghostState.released) {
        const gates = [];
        for (let y = 0; y < board.length; y++) {
            for (let x = 0; x < board[0].length; x++) {
                if (board[y][x] === '-') gates.push({ x, y });
            }
        }

        if (gates.length) {
            let bestOption = options[0];
            let bestDistance = Number.POSITIVE_INFINITY;

            for (const option of options) {
                const next = getNextPosition(board, ghost.x, ghost.y, option);
                const nx = next.x;
                const ny = next.y;

                let nearestGateDistance = Number.POSITIVE_INFINITY;
                for (const gate of gates) {
                    const d = Math.abs(gate.x - nx) + Math.abs(gate.y - ny);
                    if (d < nearestGateDistance) nearestGateDistance = d;
                }

                if (nearestGateDistance < bestDistance) {
                    bestDistance = nearestGateDistance;
                    bestOption = option;
                }
            }

            return bestOption;
        }
    }

    if (powerTurnsRemaining > 0 && ghostState.released) {
        ghostState.frightened = true;

        let safest = options[0];
        let safestDistance = -1;

        for (const option of options) {
            const next = getNextPosition(board, ghost.x, ghost.y, option);
            const distance = Math.abs(player.x - next.x) + Math.abs(player.y - next.y);

            if (distance > safestDistance) {
                safestDistance = distance;
                safest = option;
            }
        }

        return safest;
    }

    ghostState.frightened = false;

    const chasePlayer = Math.random() < 0.65;
    if (!chasePlayer) {
        return options[Math.floor(Math.random() * options.length)];
    }

    let best = options[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const option of options) {
        const next = getNextPosition(board, ghost.x, ghost.y, option);
        const nx = next.x;
        const ny = next.y;
        const distance = Math.abs(player.x - nx) + Math.abs(player.y - ny);

        if (distance < bestDistance) {
            bestDistance = distance;
            best = option;
        }
    }

    return best;
}

function buildControls(disabled = false) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pacman_up').setLabel('Up').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pacman_left').setLabel('Left').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('pacman_right').setLabel('Right').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pacman_down').setLabel('Down').setEmoji('⬇️').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    );

    return [row1, row2, row3];
}

async function playPacmanGame(message) {
    const gameState = cloneBoard();
    const board = gameState.board;
    const player = gameState.player;
    const ghosts = gameState.ghosts;

    let score = 0;
    let gameOver = false;
    let turnBusy = false;
    let result = 'playing';
    const ghostStates = ghosts.map((_, index) => ({
        released: false,
        releaseDelayTurns: index * 2,
        frightened: false,
        spawn: { x: ghosts[index].x, y: ghosts[index].y }
    }));
    let turnCount = 0;
    let powerTurnsRemaining = 0;
    const inactivityMs = 15_000;
    let inactivityTimer = null;

    if (board[player.y][player.x] === '.') {
        board[player.y][player.x] = ' ';
    }

    const createEmbed = (stateText = 'Use the buttons to move!') => {
        const pelletsLeft = countPellets(board);
        const powerText = powerTurnsRemaining > 0 ? ` | **Power:** ${powerTurnsRemaining}` : '';
        return new EmbedBuilder()
            .setColor(result === 'win' ? 0x57f287 : result === 'lose' ? 0xed4245 : 0x5865f2)
            .setTitle('🕹️ Pacman-Style Arcade')
            .setDescription(
                `${renderBoard(board, player, ghosts, ghostStates, powerTurnsRemaining)}\n` +
                `**Score:** ${score} | **Pellets Left:** ${pelletsLeft}${powerText}\n` +
                `${stateText}`
            )
            .setFooter({ text: 'P=you, G/W=ghost(s), F=fear ghost, ▓=wall, •=pellet, O=power orb' });
    };

    const gameMessage = await message.reply({
        embeds: [createEmbed()],
        components: buildControls(false)
    });

    const collector = gameMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (interaction) => interaction.user.id === message.author.id
    });

    const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(async () => {
            if (gameOver) return;
            result = 'lose';
            await finishGame('👻 You were idle for 15 seconds. Ghost caught you!');
            collector.stop('idle_caught');
        }, inactivityMs);
    };

    const finishGame = async (stateText) => {
        gameOver = true;
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        const baseReward = Math.floor(score * 1.5);
        let bonus = 0;

        if (result === 'win') {
            bonus = 120;
        } else if (result === 'timeout') {
            bonus = 20;
        }

        const reward = baseReward + bonus;
        if (reward > 0) {
            await economyManager.addMoney(message.guild.id, message.author.id, reward);
        }

        const finalText = `${stateText}${reward > 0 ? `\n💰 Reward: **+${reward}** coins` : ''}`;
        await gameMessage.edit({ embeds: [createEmbed(finalText)], components: buildControls(true) }).catch(() => {});
    };

    collector.on('collect', async (interaction) => {
        if (gameOver) {
            return interaction.deferUpdate().catch(() => {});
        }

        if (turnBusy) {
            return interaction.deferUpdate().catch(() => {});
        }

        turnBusy = true;
        resetInactivityTimer();

        try {
            const move = interaction.customId.replace('pacman_', '');

            tryMove(player, board, move);

            const playerCollision = resolvePlayerGhostCollision(player, ghosts, ghostStates, powerTurnsRemaining);
            if (playerCollision.ghostsEaten > 0) {
                score += playerCollision.ghostsEaten * 200;
            }

            if (playerCollision.playerCaught) {
                result = 'lose';
                await interaction.deferUpdate().catch(() => {});
                await finishGame('💀 The ghost caught you!');
                collector.stop('caught');
                return;
            }

            if (board[player.y][player.x] === '.') {
                board[player.y][player.x] = ' ';
                score += 10;
            } else if (board[player.y][player.x] === 'o') {
                board[player.y][player.x] = ' ';
                score += 50;
                powerTurnsRemaining = POWER_ORB_TURNS;
                for (const ghostState of ghostStates) {
                    ghostState.frightened = ghostState.released;
                }
            }

            if (countPellets(board) === 0) {
                result = 'win';
                await interaction.deferUpdate().catch(() => {});
                await finishGame('🏆 You cleared the maze!');
                collector.stop('cleared');
                return;
            }

            turnCount += 1;
            for (let i = 0; i < ghosts.length; i++) {
                const ghost = ghosts[i];
                const ghostState = ghostStates[i];

                if (!ghostState.released && turnCount < ghostState.releaseDelayTurns) {
                    continue;
                }

                const ghostMove = getGhostMove(board, ghost, player, ghostState, powerTurnsRemaining);
                if (ghostMove) {
                    tryMoveGhost(ghost, board, ghostMove, ghostState);
                }

                const ghostCollision = resolvePlayerGhostCollision(player, ghosts, ghostStates, powerTurnsRemaining);
                if (ghostCollision.ghostsEaten > 0) {
                    score += ghostCollision.ghostsEaten * 200;
                }

                if (ghostCollision.playerCaught) {
                    result = 'lose';
                    await interaction.deferUpdate().catch(() => {});
                    await finishGame('💀 A ghost caught you!');
                    collector.stop('caught');
                    return;
                }
            }

            if (powerTurnsRemaining > 0) {
                powerTurnsRemaining -= 1;
                if (powerTurnsRemaining === 0) {
                    for (const ghostState of ghostStates) {
                        ghostState.frightened = false;
                    }
                }
            }

            await interaction.update({ embeds: [createEmbed('Keep moving!')], components: buildControls(false) });
        } catch (error) {
            console.error('Pacman turn error:', error);
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate().catch(() => {});
            }
            await gameMessage.edit({ embeds: [createEmbed('⚠️ Recovered from a turn error. Keep playing.')], components: buildControls(false) }).catch(() => {});
        } finally {
            turnBusy = false;
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        if (gameOver) return;

        if (reason !== 'idle_caught') {
            result = 'timeout';
            await finishGame('🛑 Game ended.');
        }
    });

    resetInactivityTimer();
}
