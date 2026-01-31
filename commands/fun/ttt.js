const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'ttt',
    description: 'Play tic-tac-toe and bet your coins!',
    usage: '!ttt <bet>',
    aliases: ['tictactoe', 'tic'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0], 10);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!ttt <bet>`');
            }

            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don\'t have enough coins! Your balance: ${userData.balance} coins`);
            }

            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            await playTicTacToeWithBet(message, bet);
        } catch (error) {
            console.error('Error in ttt command:', error);
            message.reply('❌ An error occurred while playing tic-tac-toe!');
        }
    }
};

async function playTicTacToeWithBet(message, bet) {
    const board = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
    let finished = false;

    const checkWinner = (b) => {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        for (const [a, b, c] of lines) {
            if (board[a] !== ' ' && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        return board.includes(' ') ? null : 'tie';
    };

    const botMove = () => {
        const findMove = (symbol) => {
            const lines = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8],
                [0, 3, 6], [1, 4, 7], [2, 5, 8],
                [0, 4, 8], [2, 4, 6]
            ];
            for (const [a, b, c] of lines) {
                const cells = [board[a], board[b], board[c]];
                if (cells.filter(x => x === symbol).length === 2 && cells.includes(' ')) {
                    return [a, b, c].find(i => board[i] === ' ');
                }
            }
            return null;
        };

        let move = findMove('O');
        if (move !== null) return move;
        move = findMove('X');
        if (move !== null) return move;
        if (board[4] === ' ') return 4;
        const available = board.map((v, i) => v === ' ' ? i : null).filter(x => x !== null);
        return available[Math.floor(Math.random() * available.length)];
    };

    const renderBoard = () => {
        const emojis = { 'X': '❌', 'O': '⭕', ' ': '⬜' };
        return board.map((cell, i) => {
            if (i % 3 === 0 && i !== 0) return '\n';
            return emojis[cell];
        }).join('');
    };

    const createButtons = (disabled = false) => {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder().addComponents(
                [0, 1, 2].map(j => {
                    const idx = i * 3 + j;
                    return new ButtonBuilder()
                        .setCustomId(`tttbet_${idx}`)
                        .setLabel(board[idx] === ' ' ? `${idx + 1}` : board[idx])
                        .setStyle(board[idx] === ' ' ? ButtonStyle.Secondary : ButtonStyle.Primary)
                        .setDisabled(disabled || board[idx] !== ' ');
                })
            );
            rows.push(row);
        }
        return rows;
    };

    const prompt = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Tic-Tac-Toe (Betting)')
        .setDescription(`You are ❌ | Bot is ⭕\nBet: **${bet} coins**\nYour turn!`);

    const msg = await message.reply({ embeds: [prompt], components: createButtons() });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000,
        filter: interaction => interaction.user.id === message.author.id
    });

    const finishGame = async (winner, interaction = null) => {
        if (finished) return;
        finished = true;

        let resultText;
        let color;
        let payout = 0;

        if (winner === 'X') {
            resultText = '🎉 You win!';
            color = 0x57f287;
            payout = bet * 2;
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
        } else if (winner === 'O') {
            resultText = '🤖 Bot wins!';
            color = 0xed4245;
        } else {
            resultText = "🤝 It's a tie!";
            color = 0xf1c40f;
            payout = bet;
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
        }

        const result = new EmbedBuilder()
            .setColor(color)
            .setTitle('Tic-Tac-Toe (Betting)')
            .setDescription(
                renderBoard() + '\n\n' + resultText +
                `\n\nBet: **${bet}** | Payout: **${payout}**`
            );

        if (interaction) {
            await interaction.update({ embeds: [result], components: createButtons(true) });
        } else {
            await msg.edit({ embeds: [result], components: createButtons(true) });
        }
        collector.stop('finished');
    };

    collector.on('collect', async interaction => {
        const idx = Number(interaction.customId.replace('tttbet_', ''));
        board[idx] = 'X';

        let winner = checkWinner(board);
        if (winner) {
            await finishGame(winner, interaction);
            return;
        }

        const botIdx = botMove();
        board[botIdx] = 'O';

        winner = checkWinner(board);
        const statusEmbed = new EmbedBuilder()
            .setColor(winner ? (winner === 'O' ? 0xed4245 : 0xf1c40f) : 0x5865f2)
            .setTitle('Tic-Tac-Toe (Betting)')
            .setDescription(
                renderBoard() + '\n\n' +
                (winner === 'O' ? '🤖 Bot wins!' : winner === 'tie' ? "🤝 It's a tie!" : 'Your turn!') +
                `\n\nBet: **${bet} coins**`
            );

        await interaction.update({ embeds: [statusEmbed], components: createButtons(!!winner) });
        if (winner) await finishGame(winner);
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time' && !finished) {
            await economyManager.addMoney(message.guild.id, message.author.id, bet);
            await msg.edit({
                content: '⏰ Game timed out. Your bet was refunded.',
                components: createButtons(true)
            });
        }
    });
}
