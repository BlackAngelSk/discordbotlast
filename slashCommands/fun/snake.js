const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { memberHasBetaAccess, getBetaRoleName } = require('../../utils/betaAccess');
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 10;
const TICK_MS = 1400;
const GAME_TIMEOUT_MS = 180000;
const SNAKE_BETA_ONLY = true; // Set to false to disable beta-only access for this command.

const activeSnakeSessions = new Set();

const DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

const OPPOSITE_DIRECTIONS = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
};

module.exports = {
    data: new SlashCommandBuilder()
    
        .setName('snake')
        .setDescription('Play Snake with directional buttons right in Discord!'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const sessionKey = `${guildId}_${userId}`;

        if (SNAKE_BETA_ONLY && !memberHasBetaAccess(interaction.member)) {
            return interaction.reply({
                content: `❌ Beta only. You need the \`${getBetaRoleName()}\` role.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (activeSnakeSessions.has(sessionKey)) {
            return interaction.reply({
                content: '⏳ You already have an active Snake game. Finish it first.',
                flags: MessageFlags.Ephemeral
            });
        }

        activeSnakeSessions.add(sessionKey);

        try {
            await runGame(interaction);
        } catch (error) {
            console.error('Error in snake command:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while starting Snake.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } finally {
            activeSnakeSessions.delete(sessionKey);
        }
    }
};

function positionsEqual(a, b) {
    return a.x === b.x && a.y === b.y;
}

function isInsideBoard(pos) {
    return pos.x >= 0 && pos.x < BOARD_WIDTH && pos.y >= 0 && pos.y < BOARD_HEIGHT;
}

function spawnFood(snake) {
    const occupied = new Set(snake.map(segment => `${segment.x},${segment.y}`));
    const freeTiles = [];

    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const key = `${x},${y}`;
            if (!occupied.has(key)) {
                freeTiles.push({ x, y });
            }
        }
    }

    if (!freeTiles.length) {
        return null;
    }

    return freeTiles[Math.floor(Math.random() * freeTiles.length)];
}

function createBoard(game) {
    const rows = [];

    for (let y = 0; y < BOARD_HEIGHT; y++) {
        let row = '';

        for (let x = 0; x < BOARD_WIDTH; x++) {
            const tile = { x, y };

            if (game.food && positionsEqual(tile, game.food)) {
                row += '🍎';
                continue;
            }

            if (positionsEqual(tile, game.snake[0])) {
                row += '🟢';
                continue;
            }

            const isBody = game.snake.slice(1).some(segment => positionsEqual(segment, tile));
            if (isBody) {
                row += '🟩';
                continue;
            }

            row += '⬛';
        }

        rows.push(row);
    }

    return rows.join('\n');
}

function createEmbed(interaction, game, ended = false, endReason = '') {
    const title = ended ? '🐍 Snake - Game Over' : '🐍 Snake';
    const color = ended ? 0xed4245 : 0x57f287;
    const length = game.snake.length;
    const maxScore = (BOARD_WIDTH * BOARD_HEIGHT) - 3;

    let description = `${createBoard(game)}\n\n`;
    if (ended) {
        description += `${endReason}\n`;
        description += `🏁 Final score: **${game.score}**`;
    } else {
        description += 'Use the buttons to steer. Eat apples and avoid walls/body.';
    }

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'Score', value: `${game.score}`, inline: true },
            { name: 'Length', value: `${length}`, inline: true },
            { name: 'Best possible', value: `${maxScore}`, inline: true },
            { name: 'Player', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'Tip: You cannot instantly reverse direction.' });
}

function createControls(disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('snake_up')
                .setLabel('Up')
                .setEmoji('⬆️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('snake_left')
                .setLabel('Left')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('snake_down')
                .setLabel('Down')
                .setEmoji('⬇️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('snake_right')
                .setLabel('Right')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('snake_stop')
                .setLabel('Stop')
                .setEmoji('🛑')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        )
    ];
}

async function runGame(interaction) {
    const initialSnake = [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 }
    ];

    const game = {
        snake: initialSnake,
        food: spawnFood(initialSnake),
        direction: 'right',
        queuedDirection: null,
        score: 0,
        ended: false
    };

    await interaction.reply({
        embeds: [createEmbed(interaction, game)],
        components: createControls(false)
    });

    const message = await interaction.fetchReply();

    return new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: GAME_TIMEOUT_MS
        });

        const endGame = async (reasonText) => {
            if (game.ended) return;

            game.ended = true;
            clearInterval(loop);
            collector.stop('ended');

            await interaction.editReply({
                embeds: [createEmbed(interaction, game, true, reasonText)],
                components: createControls(true)
            }).catch(() => {});

            resolve();
        };

        let updating = false;

        const loop = setInterval(async () => {
            if (game.ended || updating) return;
            updating = true;

            try {
                if (game.queuedDirection && OPPOSITE_DIRECTIONS[game.direction] !== game.queuedDirection) {
                    game.direction = game.queuedDirection;
                }
                game.queuedDirection = null;

                const head = game.snake[0];
                const vector = DIRECTION_VECTORS[game.direction];
                const nextHead = {
                    x: head.x + vector.x,
                    y: head.y + vector.y
                };

                if (!isInsideBoard(nextHead)) {
                    await endGame('🧱 You hit a wall.');
                    return;
                }

                const willEat = game.food && positionsEqual(nextHead, game.food);
                const bodyToCheck = willEat ? game.snake : game.snake.slice(0, -1);
                const hitSelf = bodyToCheck.some(segment => positionsEqual(segment, nextHead));

                if (hitSelf) {
                    await endGame('💥 You ran into yourself.');
                    return;
                }

                game.snake.unshift(nextHead);

                if (willEat) {
                    game.score += 1;
                    game.food = spawnFood(game.snake);

                    if (!game.food) {
                        await endGame('🏆 Perfect board clear!');
                        return;
                    }
                } else {
                    game.snake.pop();
                }

                await interaction.editReply({
                    embeds: [createEmbed(interaction, game)],
                    components: createControls(false)
                }).catch(() => {});
            } finally {
                updating = false;
            }
        }, TICK_MS);

        collector.on('collect', async (i) => {
            try {
                if (!i.customId.startsWith('snake_')) {
                    return i.deferUpdate().catch(() => {});
                }

                if (i.user.id !== interaction.user.id) {
                    return i.reply({
                        content: '❌ This snake game belongs to someone else.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                if (game.ended) {
                    return i.deferUpdate().catch(() => {});
                }

                if (i.customId === 'snake_stop') {
                    await i.deferUpdate().catch(() => {});
                    await endGame('🛑 You stopped the game.');
                    return;
                }

                const requestedDirection = i.customId.replace('snake_', '');
                if (!DIRECTION_VECTORS[requestedDirection]) {
                    return i.deferUpdate().catch(() => {});
                }

                if (OPPOSITE_DIRECTIONS[game.direction] !== requestedDirection) {
                    game.queuedDirection = requestedDirection;
                }

                await i.deferUpdate().catch(() => {});
            } catch (error) {
                console.error('Error handling snake button interaction:', error);
                if (!i.replied && !i.deferred) {
                    await i.reply({
                        content: '❌ Something went wrong. The game is ending.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                await endGame('Game ended due to an internal error.');
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (game.ended) return;

            clearInterval(loop);

            if (reason === 'time') {
                await endGame('⏰ Time is up.');
                return;
            }

            await interaction.editReply({
                embeds: [createEmbed(interaction, game, true, 'Game ended.')],
                components: createControls(true)
            }).catch(() => {});

            resolve();
        });
    });
}
