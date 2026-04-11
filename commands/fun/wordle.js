const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const WORD_LIST = [
    'apple','bread','chair','dance','eagle','flame','grape','horse','image','juice',
    'knife','lemon','magic','night','ocean','piano','queen','river','solar','tiger',
    'ultra','voice','water','xenon','yacht','zebra','brave','crown','depth','elfin',
    'frost','globe','heart','ideal','joust','karma','lance','mirth','naval','olive',
    'pearl','quest','radon','stone','thyme','umbra','vivid','waltz','xylem','yield',
    'abode','blaze','crisp','drift','ember','flair','glare','haste','inlet','joker',
    'knack','lusty','might','notch','optic','proxy','quota','rapid','scone','tower',
    'unity','vigil','width','xeric','youth','zonal',
];

const COLORS = { wrong: '⬛', misplaced: '🟨', correct: '🟩' };
const MAX_GUESSES = 6;

// Active games: { userId: { word, guesses, channelId } }
const activeGames = new Map();

function scoreGuess(word, guess) {
    const result = Array(5).fill('wrong');
    const wordArr = word.split('');
    const guessArr = guess.split('');

    // First pass: exact matches
    for (let i = 0; i < 5; i++) {
        if (guessArr[i] === wordArr[i]) {
            result[i] = 'correct';
            wordArr[i] = null;
            guessArr[i] = null;
        }
    }
    // Second pass: misplaced
    for (let i = 0; i < 5; i++) {
        if (guessArr[i] === null) continue;
        const idx = wordArr.indexOf(guessArr[i]);
        if (idx !== -1) {
            result[i] = 'misplaced';
            wordArr[idx] = null;
        }
    }
    return result;
}

function renderBoard(guesses) {
    return guesses.map(({ word, result }) => {
        const tiles = word.split('').map((l, i) => COLORS[result[i]]);
        return `${tiles.join('')}  \`${word.toUpperCase()}\``;
    }).join('\n') || '*No guesses yet*';
}

module.exports = {
    name: 'wordle',
    description: 'Play Wordle! Guess the 5-letter word in 6 tries.',
    usage: '!wordle [guess]',
    aliases: [],
    category: 'fun',
    async execute(message, args, client) {
        const userId = message.author.id;

        // Start new game
        if (!args[0] || args[0].length !== 5) {
            if (activeGames.has(userId)) {
                const game = activeGames.get(userId);
                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🟩 Wordle — Game in Progress')
                    .setDescription(`You already have an active game!\n\n${renderBoard(game.guesses)}\n\nType \`!wordle <5-letter-word>\` to guess, or \`!wordle quit\` to give up.`)
                    .setFooter({ text: `${MAX_GUESSES - game.guesses.length} guesses remaining` });
                return message.reply({ embeds: [embed] });
            }

            const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
            activeGames.set(userId, { word, guesses: [], channelId: message.channel.id });

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🟩 Wordle Started!')
                .setDescription('I\'ve chosen a **5-letter word**. You have **6 guesses** to figure it out!\n\n🟩 = correct position\n🟨 = wrong position\n⬛ = not in word\n\nType `!wordle <word>` to guess.')
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        const guess = args[0].toLowerCase();

        if (guess === 'quit') {
            if (!activeGames.has(userId)) return message.reply('❌ You have no active Wordle game.');
            const game = activeGames.get(userId);
            activeGames.delete(userId);
            return message.reply(`🏳️ Game ended. The word was **${game.word.toUpperCase()}**.`);
        }

        if (!activeGames.has(userId)) {
            return message.reply('❌ You have no active Wordle game. Start one with `!wordle`.');
        }

        if (!/^[a-z]{5}$/.test(guess)) {
            return message.reply('❌ Guess must be exactly 5 letters.');
        }

        const game = activeGames.get(userId);

        // Check duplicate guess
        if (game.guesses.some(g => g.word === guess)) {
            return message.reply(`❌ You already tried **${guess.toUpperCase()}**.`);
        }

        const result = scoreGuess(game.word, guess);
        game.guesses.push({ word: guess, result });

        const won = result.every(r => r === 'correct');
        const lost = !won && game.guesses.length >= MAX_GUESSES;

        if (won || lost) activeGames.delete(userId);

        const board = renderBoard(game.guesses);

        const embed = new EmbedBuilder()
            .setTitle('🟩 Wordle')
            .setDescription(board);

        if (won) {
            const prize = (MAX_GUESSES - game.guesses.length + 1) * 200;
            await economyManager.addMoney(message.guild.id, userId, prize);
            embed.setColor(0x57f287)
                .addFields({ name: '🎉 You won!', value: `The word was **${game.word.toUpperCase()}**!\nYou earned **${prize} coins**!` });
        } else if (lost) {
            embed.setColor(0xed4245)
                .addFields({ name: '💀 Game Over', value: `The word was **${game.word.toUpperCase()}**.` });
        } else {
            embed.setColor(0x5865f2)
                .setFooter({ text: `${MAX_GUESSES - game.guesses.length} guesses remaining` });
        }

        await message.reply({ embeds: [embed] });
    }
};
