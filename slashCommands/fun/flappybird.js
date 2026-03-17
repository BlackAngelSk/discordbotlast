const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

const BOARD_WIDTH = 16;
const BOARD_HEIGHT = 8;
const BIRD_X = 4;
const TICK_MS = 1200;
const GAME_TIMEOUT_MS = 180000;
const GRAVITY = 0.5;
const FLAP_STRENGTH = -1.15;
const MAX_FALL_SPEED = 1.1;
const PIPE_SPACING = 8;

const activeFlappySessions = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flappybird')
        .setDescription('Play Flappy Bird with buttons right in Discord!'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const sessionKey = `${guildId}_${userId}`;

        if (activeFlappySessions.has(sessionKey)) {
            return interaction.reply({
                content: '⏳ You already have an active Flappy Bird game. Finish it first.',
                ephemeral: true
            });
        }

        activeFlappySessions.add(sessionKey);

        try {
            await runGame(interaction);
        } catch (error) {
            console.error('Error in flappybird command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while starting Flappy Bird.', ephemeral: true });
            }
        } finally {
            activeFlappySessions.delete(sessionKey);
        }
    }
};

function randomGapCenter() {
    return Math.floor(Math.random() * (BOARD_HEIGHT - 4)) + 2;
}

function createPipe(x) {
    return {
        x,
        gapCenter: randomGapCenter()
    };
}

function getRightmostPipeX(pipes) {
    if (!pipes.length) return BOARD_WIDTH - 1;
    return Math.max(...pipes.map(pipe => pipe.x));
}

function ensurePipeCount(game) {
    const targetCount = game.score >= 1 ? 2 : 1;

    while (game.pipes.length < targetCount) {
        const nextX = getRightmostPipeX(game.pipes) + PIPE_SPACING;
        game.pipes.push(createPipe(nextX));
    }
}

function createBoard(game) {
    const birdRow = Math.round(game.birdY);
    const rows = [];

    for (let y = 0; y < BOARD_HEIGHT; y++) {
        let row = '';

        for (let x = 0; x < BOARD_WIDTH; x++) {
            let tile = '⬛';

            const isPipeTile = game.pipes.some(pipe => 
                x === pipe.x && (y < pipe.gapCenter - 1 || y > pipe.gapCenter + 1)
            );

            if (isPipeTile) {
                tile = '🟩';
            }

            if (x === BIRD_X && y === birdRow) {
                tile = '🐤';
            }

            row += tile;
        }

        rows.push(row);
    }

    return rows.join('\n');
}

function createEmbed(interaction, game, ended = false, endReason = '') {
    const color = ended ? 0xed4245 : 0x5865f2;
    const title = ended ? '🐤 Flappy Bird - Game Over' : '🐤 Flappy Bird';

    let description = `${createBoard(game)}\n\n`;

    if (ended) {
        description += `${endReason}\n`;
        description += `🏁 Final score: **${game.score}**`;
    } else {
        description += 'Click **Flap** to dodge the green pillars.';
    }

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'Score', value: `${game.score}`, inline: true },
            { name: 'Best this run', value: `${Math.max(game.best, game.score)}`, inline: true },
            { name: 'Player', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({ text: 'Tip: Spam Flap for lift, pause for descent.' });
}

function createControls(disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('flappybird_flap')
                .setLabel('Flap')
                .setEmoji('🪽')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled)
        )
    ];
}

async function runGame(interaction) {
    const game = {
        birdY: Math.floor(BOARD_HEIGHT / 2),
        velocity: 0,
        pipes: [createPipe(BOARD_WIDTH - 1)],
        queuedFlap: false,
        score: 0,
        best: 0,
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
            time: GAME_TIMEOUT_MS,
            filter: i => i.customId === 'flappybird_flap'
        });

        const endGame = async (reasonText) => {
            if (game.ended) return;
            game.ended = true;

            clearInterval(tickInterval);
            collector.stop('ended');

            await interaction.editReply({
                embeds: [createEmbed(interaction, game, true, reasonText)],
                components: createControls(true)
            }).catch(() => {});

            resolve();
        };

        const tickInterval = setInterval(async () => {
            if (game.ended) return;

            if (game.queuedFlap) {
                game.velocity = FLAP_STRENGTH;
                game.queuedFlap = false;
            } else {
                game.velocity = Math.min(game.velocity + GRAVITY, MAX_FALL_SPEED);
            }

            game.birdY += game.velocity;

            // Keep bird within board limits without ending the game.
            // Death should only happen when colliding with green pillars.
            if (game.birdY < 0) {
                game.birdY = 0;
                game.velocity = 0;
            } else if (game.birdY > BOARD_HEIGHT - 1) {
                game.birdY = BOARD_HEIGHT - 1;
                game.velocity = 0;
            }

            for (const pipe of game.pipes) {
                pipe.x -= 1;
            }

            const passedPipes = game.pipes.filter(pipe => pipe.x < 0).length;
            if (passedPipes > 0) {
                game.score += passedPipes;
                game.best = Math.max(game.best, game.score);
            }

            game.pipes = game.pipes.filter(pipe => pipe.x >= 0);
            ensurePipeCount(game);

            const birdRow = Math.round(game.birdY);
            const hitPipe = game.pipes.some(pipe =>
                pipe.x === BIRD_X && (birdRow < pipe.gapCenter - 1 || birdRow > pipe.gapCenter + 1)
            );

            if (hitPipe) {
                await endGame('💥 You hit a pipe.');
                return;
            }

            await interaction.editReply({
                embeds: [createEmbed(interaction, game)],
                components: createControls(false)
            }).catch(() => {});
        }, TICK_MS);

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                try {
                    if (!i.replied && !i.deferred) {
                        await i.reply({ content: '❌ This game belongs to someone else.', ephemeral: true });
                    }
                } catch (_error) {
                    await i.deferUpdate().catch(() => {});
                }
                return;
            }

            if (game.ended) {
                return i.deferUpdate().catch(() => {});
            }

            if (i.customId === 'flappybird_flap') {
                game.queuedFlap = true;
                await i.deferUpdate().catch(() => {});
                return;
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (game.ended) return;

            clearInterval(tickInterval);

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
