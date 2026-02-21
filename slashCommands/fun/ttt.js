const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ttt')
        .setDescription('Play tic-tac-toe and bet your coins!')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10)),
    
    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');

            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }

            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);

            await playTicTacToeWithBet(interaction, bet);
        } catch (error) {
            console.error('Error in ttt command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing tic-tac-toe!', ephemeral: true });
            }
        }
    }
};

async function playTicTacToeWithBet(interaction, bet) {
    const board = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
    let finished = false;
    
    // Get player stats to determine adaptive difficulty
    const playerStats = gameStatsManager.getStats(interaction.user.id);
    const tttStats = playerStats.ttt || { wins: 0, losses: 0, ties: 0 };
    const totalGames = tttStats.wins + tttStats.losses + tttStats.ties;
    const winRate = totalGames > 0 ? tttStats.wins / totalGames : 0;
    
    // Debug output
    console.log(`[TTT] ${interaction.user.username} - Total games: ${totalGames}, Win rate: ${(winRate * 100).toFixed(1)}%`);
    console.log(`[TTT] Stats - W:${tttStats.wins} L:${tttStats.losses} T:${tttStats.ties}`);
    
    // Adaptive difficulty system that responds to player performance
    // - Starts easy for beginners
    // - Increases gradually with experience
    // - Adjusts based on win rate to keep games challenging but fair
    let smartPlayChance;
    let difficultyLevel;
    
    if (totalGames < 3) {
        // Beginner: Very easy mode
        smartPlayChance = 0.35 + (totalGames * 0.05); // 35%, 40%, 45%
        difficultyLevel = '**EASY** 🟢';
    } else if (totalGames < 8) {
        // Learning phase: Gradual increase
        const baseChance = 0.50 + ((totalGames - 3) * 0.03); // 50% to 65%
        smartPlayChance = baseChance;
        difficultyLevel = '**MEDIUM** 🟡';
    } else {
        // Adaptive phase: Difficulty based on performance
        // Target win rate: 30-40% (fair but challenging)
        
        let baseChance = 0.65 + (Math.min(40, totalGames - 8) * 0.004); // 65% to 81% over 40 games
        
        // Strong adjustments based on win rate to keep it fair
        if (winRate > 0.50) {
            // Player dominating - make it much harder
            baseChance += 0.15;
            difficultyLevel = '**EXPERT** 🔴';
        } else if (winRate > 0.40) {
            // Player doing well - increase challenge
            baseChance += 0.08;
            difficultyLevel = '**EXPERT** 🔴';
        } else if (winRate > 0.32) {
            // Player in good range - balanced
            difficultyLevel = '**HARD** 🟠';
        } else if (winRate > 0.26) {
            // Below target - help a bit
            baseChance -= 0.10;
            difficultyLevel = '**HARD** 🟠';
        } else if (winRate > 0.20) {
            // Struggling - significant reduction
            baseChance -= 0.20;
            difficultyLevel = '**MEDIUM** 🟡';
        } else {
            // Really struggling - major reduction
            baseChance -= 0.30;
            difficultyLevel = '**EASY** 🟢';
        }
        
        // Cap between 35% and 90%
        smartPlayChance = Math.max(0.35, Math.min(0.90, baseChance));
    }
    
    // Debug output
    console.log(`[TTT] Difficulty: ${difficultyLevel}, Smart play chance: ${(smartPlayChance * 100).toFixed(1)}%`);

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
        // Use smart play based on difficulty
        if (Math.random() > smartPlayChance) {
            const available = board.map((v, i) => v === ' ' ? i : null).filter(x => x !== null);
            return available[Math.floor(Math.random() * available.length)];
        }

        // Minimax algorithm - perfect play when triggered
        const minimax = (b, depth, isMaximizing) => {
            const lines = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8],
                [0, 3, 6], [1, 4, 7], [2, 5, 8],
                [0, 4, 8], [2, 4, 6]
            ];
            
            // Check terminal states
            for (const [a, i, c] of lines) {
                if (b[a] !== ' ' && b[a] === b[i] && b[a] === b[c]) {
                    if (b[a] === 'O') return 10 - depth; // AI winning
                    if (b[a] === 'X') return depth - 10; // Player winning
                }
            }
            
            if (!b.includes(' ')) return 0; // Tie
            
            if (isMaximizing) {
                let bestScore = -Infinity;
                for (let i = 0; i < 9; i++) {
                    if (b[i] === ' ') {
                        b[i] = 'O';
                        const score = minimax(b, depth + 1, false);
                        b[i] = ' ';
                        bestScore = Math.max(score, bestScore);
                    }
                }
                return bestScore;
            } else {
                let bestScore = Infinity;
                for (let i = 0; i < 9; i++) {
                    if (b[i] === ' ') {
                        b[i] = 'X';
                        const score = minimax(b, depth + 1, true);
                        b[i] = ' ';
                        bestScore = Math.min(score, bestScore);
                    }
                }
                return bestScore;
            }
        };

        let bestScore = -Infinity;
        let bestMove = 0;
        
        for (let i = 0; i < 9; i++) {
            if (board[i] === ' ') {
                board[i] = 'O';
                const score = minimax(board, 0, false);
                board[i] = ' ';
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = i;
                }
            }
        }
        
        return bestMove;
    };

    const renderBoard = () => {
        let display = '';
        for (let i = 0; i < 9; i++) {
            if (i % 3 === 0 && i !== 0) display += '\n';
            if (board[i] === 'X') display += '❌';
            else if (board[i] === 'O') display += '⭕';
            else display += '⬜';
        }
        return display;
    };

    const createButtons = (disabled = false) => {
        const emojis = { 'X': '❌', 'O': '⭕', ' ': ' ' };
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder().addComponents(
                [0, 1, 2].map(j => {
                    const idx = i * 3 + j;
                    return new ButtonBuilder()
                        .setCustomId(`tttbet_${idx}`)
                        .setLabel(board[idx] === ' ' ? `${idx + 1}` : emojis[board[idx]])
                        .setStyle(board[idx] === ' ' ? ButtonStyle.Secondary : (board[idx] === 'X' ? ButtonStyle.Danger : ButtonStyle.Primary))
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
        .setDescription(
            `You are ❌ | Bot is ⭕\n\n` +
            `Bet: **${bet}** | Payout: **${bet * 2}**\n` +
            `🤖 AI Difficulty: ${difficultyLevel} (${Math.round(smartPlayChance * 100)}% accuracy)\n` +
            (totalGames > 0 ? `📊 Your Record: ${tttStats.wins}W-${tttStats.losses}L-${tttStats.ties}T (${totalGames} games)\n` : `📊 First game - Good luck! 🍀\n`) +
            (totalGames === 3 ? `⚠️ Difficulty increasing after this game!\n` : '') +
            (totalGames === 10 ? `⚠️ Entering expert level!\n` : '') +
            `\nYour turn!`
        );

    const msg = await interaction.reply({ embeds: [prompt], components: createButtons() });

    // Bot goes first based on difficulty (easier = less likely to go first)
    const firstMoveChance = totalGames < 3 ? 0.3 : totalGames < 10 ? 0.4 : 0.5;
    const botGoesFirst = Math.random() < firstMoveChance;
    if (botGoesFirst) {
        // For easy mode, bot makes random first move
        // For harder modes, bot uses optimal positions
        let botIdx;
        if (smartPlayChance < 0.55) {
            // Easy mode: random first move
            const available = board.map((v, i) => v === ' ' ? i : null).filter(x => x !== null);
            botIdx = available[Math.floor(Math.random() * available.length)];
        } else {
            // Medium/Hard: optimal first move (center or corner)
            const optimalFirstMoves = [4, 0, 2, 6, 8]; // Center, then corners
            botIdx = optimalFirstMoves[0]; // Center
        }
        board[botIdx] = 'O';
        
        let winner = checkWinner(board);
        const statusEmbed = new EmbedBuilder()
            .setColor(winner ? (winner === 'O' ? 0xed4245 : 0xf1c40f) : 0x5865f2)
            .setTitle('Tic-Tac-Toe (Betting)')
            .setDescription(
                renderBoard() + '\n\n' +
                (winner === 'O' ? '🤖 Bot wins!' : winner === 'tie' ? "🤝 It's a tie!" : 'Your turn!') +
                `\n\nBet: ${bet} | Payout: **${bet * 2}**`
            );

        await msg.edit({ embeds: [statusEmbed], components: createButtons(!!winner) });
        
        if (winner) {
            const finishGameFunc = async () => {
                finished = true;
                let resultText, color, payout = 0;
                if (winner === 'O') {
                    resultText = '🤖 Bot wins!';
                    color = 0xed4245;
                    await gameStatsManager.recordTTT(interaction.user.id, 'loss');
                } else {
                    resultText = "🤝 It's a tie!";
                    color = 0xf1c40f;
                    payout = bet;
                    await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
                    await gameStatsManager.recordTTT(interaction.user.id, 'tie');
                }
                const result = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('Tic-Tac-Toe (Betting)')
                    .setDescription(renderBoard() + '\n\n' + resultText + `\n\nBet: ${bet} | Payout: **${payout}**`);
                await msg.edit({ embeds: [result], components: createButtons(true) });
                collector.stop('finished');
            };
            await finishGameFunc();
            return;
        }
    }

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000,
        filter: interaction => interaction.user.id === interaction.user.id
    });

    const finishGame = async (winner, interaction_button = null) => {
        if (finished) return;
        finished = true;

        let resultText;
        let color;
        let payout = 0;

        if (winner === 'X') {
            resultText = '🎉 You win!';
            color = 0x57f287;
            payout = Math.floor(bet * 2);
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
            await gameStatsManager.recordTTT(interaction.user.id, 'win');
        } else if (winner === 'O') {
            resultText = '🤖 Bot wins!';
            color = 0xed4245;
            payout = 0;
            await gameStatsManager.recordTTT(interaction.user.id, 'loss');
        } else {
            resultText = "🤝 It's a tie!";
            color = 0xf1c40f;
            payout = bet;
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
            await gameStatsManager.recordTTT(interaction.user.id, 'tie');
        }

        const result = new EmbedBuilder()
            .setColor(color)
            .setTitle('Tic-Tac-Toe (Betting)')
            .setDescription(
                renderBoard() + '\n\n' + resultText +
                `\n\nBet: ${bet} | Payout: **${payout}**` +
                `\n🤖 AI Difficulty: ${difficultyLevel}` +
                (winner === 'X' && smartPlayChance >= 0.75 ? '\n🏆 **Great win! The AI is getting tough!**' : '') +
                (winner === 'X' && totalGames < 3 ? '\n🎉 **Nice job! Keep playing to level up!**' : '') +
                (totalGames === 2 && winner !== 'X' ? '\n💡 Tip: Try to get three in a row - block the bot!' : '')
            );

        if (interaction_button) {
            await interaction_button.update({ embeds: [result], components: createButtons(true) });
        } else {
            await msg.edit({ embeds: [result], components: createButtons(true) });
        }
        collector.stop('finished');
    };

    collector.on('collect', async interaction_button => {
        const idx = Number(interaction_button.customId.replace('tttbet_', ''));
        board[idx] = 'X';

        let winner = checkWinner(board);
        if (winner) {
            await finishGame(winner, interaction_button);
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
                `\n\nBet: ${bet} | Payout: **${bet * 2}**`
            );

        await interaction_button.update({ embeds: [statusEmbed], components: createButtons(!!winner) });
        if (winner) await finishGame(winner);
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time' && !finished) {
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, bet);
            await msg.edit({
                content: '⏰ Game timed out. Your bet was refunded.',
                components: createButtons(true)
            });
        }
    });
}
