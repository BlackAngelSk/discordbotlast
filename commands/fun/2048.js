const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

class Game2048 {
    constructor() {
        this.grid = Array(4).fill(null).map(() => Array(4).fill(0));
        this.score = 0;
        this.moves = 0;
        this.gameOver = false;
        this.addNewTile();
        this.addNewTile();
    }

    addNewTile() {
        const emptyTiles = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (this.grid[i][j] === 0) {
                    emptyTiles.push({ x: i, y: j });
                }
            }
        }
        if (emptyTiles.length === 0) return;
        
        const randomTile = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
        this.grid[randomTile.x][randomTile.y] = Math.random() < 0.9 ? 2 : 4;
    }

    canMove() {
        // Check if any moves are possible
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (this.grid[i][j] === 0) return true;
                // Check right
                if (j < 3 && this.grid[i][j] === this.grid[i][j + 1]) return true;
                // Check down
                if (i < 3 && this.grid[i][j] === this.grid[i + 1][j]) return true;
            }
        }
        return false;
    }

    move(direction) {
        const oldGrid = this.grid.map(row => [...row]);
        let moved = false;

        if (direction === 'left') moved = this.moveLeft();
        else if (direction === 'right') moved = this.moveRight();
        else if (direction === 'up') moved = this.moveUp();
        else if (direction === 'down') moved = this.moveDown();

        if (moved) {
            this.addNewTile();
            this.moves++;
            if (!this.canMove()) {
                this.gameOver = true;
            }
        }

        return moved;
    }

    moveLeft() {
        return this.compressAndMerge(this.grid, 'horizontal');
    }

    moveRight() {
        // Reverse, move left, reverse back
        for (let i = 0; i < 4; i++) {
            this.grid[i].reverse();
        }
        const moved = this.compressAndMerge(this.grid, 'horizontal');
        for (let i = 0; i < 4; i++) {
            this.grid[i].reverse();
        }
        return moved;
    }

    moveUp() {
        this.transposeGrid();
        const moved = this.compressAndMerge(this.grid, 'horizontal');
        this.transposeGrid();
        return moved;
    }

    moveDown() {
        this.transposeGrid();
        for (let i = 0; i < 4; i++) {
            this.grid[i].reverse();
        }
        const moved = this.compressAndMerge(this.grid, 'horizontal');
        for (let i = 0; i < 4; i++) {
            this.grid[i].reverse();
        }
        this.transposeGrid();
        return moved;
    }

    transposeGrid() {
        const transposed = Array(4).fill(null).map(() => Array(4).fill(0));
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                transposed[j][i] = this.grid[i][j];
            }
        }
        this.grid = transposed;
    }

    compressAndMerge(grid, direction) {
        let moved = false;
        
        for (let i = 0; i < 4; i++) {
            const row = grid[i];
            const newRow = row.filter(val => val !== 0);
            
            // Merge
            for (let j = 0; j < newRow.length - 1; j++) {
                if (newRow[j] === newRow[j + 1]) {
                    newRow[j] *= 2;
                    this.score += newRow[j];
                    newRow.splice(j + 1, 1);
                }
            }
            
            // Pad with zeros
            while (newRow.length < 4) {
                newRow.push(0);
            }
            
            // Check if moved
            for (let j = 0; j < 4; j++) {
                if (row[j] !== newRow[j]) {
                    moved = true;
                }
            }
            
            grid[i] = newRow;
        }
        
        return moved;
    }

    getTileEmoji(value) {
        const emojis = {
            0: '⬛',
            2: '2️⃣',
            4: '4️⃣',
            8: '8️⃣',
            16: '1️⃣6️⃣',
            32: '3️⃣2️⃣',
            64: '6️⃣4️⃣',
            128: '🔢',
            256: '🔢',
            512: '🎰',
            1024: '💰',
            2048: '🏆'
        };
        return emojis[value] || '❓';
    }

    renderBoard() {
        let board = '```\n';
        for (let i = 0; i < 4; i++) {
            const row = this.grid[i].map(val => {
                if (val === 0) return '    .';
                return `${val}`.padStart(5);
            }).join('');
            board += row + '\n';
        }
        board += '```';
        return board;
    }

    getEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🎮 2048 Game')
            .setColor('#FFD700')
            .addFields(
                { name: 'Score', value: `${this.score}`, inline: true },
                { name: 'Moves', value: `${this.moves}`, inline: true },
                { name: 'Status', value: this.gameOver ? '💀 Game Over!' : '🎯 Playing', inline: true },
                { name: 'Board', value: this.renderBoard(), inline: false }
            );
        return embed;
    }
}

module.exports = {
    name: '2048',
    aliases: ['twentyfortyeight'],
    description: 'Play the classic 2048 puzzle game! Combine tiles to reach 2048.',
    category: 'fun',
    cooldown: 5,
    execute: async (interaction) => {
        const game = new Game2048();

        const createButtons = () => {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('2048_up')
                        .setLabel('⬆️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('2048_left')
                        .setLabel('⬅️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('2048_right')
                        .setLabel('➡️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('2048_down')
                        .setLabel('⬇️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('2048_quit')
                        .setLabel('Quit')
                        .setStyle(ButtonStyle.Danger)
                );
            return row;
        };

        await interaction.reply({
            embeds: [game.getEmbed()],
            components: [createButtons()]
        });

        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000,
            filter: buttonInteraction => buttonInteraction.user.id === interaction.user.id
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                const customId = buttonInteraction.customId;

                if (customId === '2048_quit') {
                    await buttonInteraction.deferUpdate();
                    collector.stop('quit');
                    return;
                }

                const directions = {
                    '2048_up': 'up',
                    '2048_down': 'down',
                    '2048_left': 'left',
                    '2048_right': 'right'
                };

                const direction = directions[customId];
                if (!direction) {
                    await buttonInteraction.deferUpdate();
                    return;
                }

                const moved = game.move(direction);
                const status = game.gameOver
                    ? '💀 Game Over!'
                    : moved
                        ? '🎯 Playing'
                        : '⛔ No tiles moved.';

                await buttonInteraction.update({
                    embeds: [game.getEmbed().spliceFields(2, 1, { name: 'Status', value: status, inline: true })],
                    components: game.gameOver ? [] : [createButtons()]
                });

                if (game.gameOver) {
                    collector.stop('game_over');
                }
            } catch (error) {
                console.error('Error in 2048 game:', error);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({
                        content: '❌ Something went wrong. The game is ending.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                collector.stop('error');
            }
        });

        collector.on('end', async (_collected, reason) => {
            const finalStatus = reason === 'quit'
                ? '🛑 You ended the game.'
                : reason === 'time'
                    ? '⏰ Game expired.'
                    : game.gameOver
                        ? '💀 Game Over!'
                        : '🛑 Game ended.';

            try {
                await interaction.editReply({
                    embeds: [game.getEmbed().spliceFields(2, 1, { name: 'Status', value: finalStatus, inline: true })],
                    components: []
                });
            } catch (error) {
                console.error('Error finalizing 2048 game:', error);
            }
        });
    }
};
