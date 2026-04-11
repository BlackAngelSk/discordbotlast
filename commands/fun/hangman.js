const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const WORDS = [
    'DISCORD','PYTHON','GAMING','SERVER','ROCKET','BUTTER','KNIGHT','SHADOW','CASTLE','DRAGON',
    'FLOWER','PLANET','BRIDGE','FOREST','GARDEN','HUNTER','ISLAND','JUNGLE','KERNEL','LIVELY',
    'MAGNET','NATURE','ORANGE','PEPPER','QUARTZ','RANDOM','SILVER','TEMPLE','UNIQUE','VECTOR',
    'WALRUS','YELLOW','ZIPPER','ANCHOR','BITTER','COPPER','DONKEY','ENGINE','FINGER','GOBLIN',
    'HARBOR','INSECT','JAGUAR','KITTEN','LOBSTER','MARBLE','NAPKIN','OYSTER','PARROT','PUZZLE',
];

const STAGES = [
    '```\n  +---+\n      |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  O   |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  O   |\n  |   |\n      |\n      |\n=========```',
    '```\n  +---+\n  O   |\n /|   |\n      |\n      |\n=========```',
    '```\n  +---+\n  O   |\n /|\\  |\n      |\n      |\n=========```',
    '```\n  +---+\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
    '```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

// Active games: { userId: { word, guessed: Set, wrong: number } }
const activeGames = new Map();

module.exports = {
    name: 'hangman',
    description: 'Play Hangman!',
    usage: '!hangman [letter]',
    aliases: [],
    category: 'fun',
    async execute(message, args, client) {
        const userId = message.author.id;

        const guess = (args[0] || '').toUpperCase();

        // Start new game
        if (!guess || guess === 'NEW') {
            if (activeGames.has(userId)) {
                const g = activeGames.get(userId);
                return message.reply({ embeds: [buildEmbed(g)] });
            }
            const word = WORDS[Math.floor(Math.random() * WORDS.length)];
            activeGames.set(userId, { word, guessed: new Set(), wrong: 0 });
            const embed = buildEmbed(activeGames.get(userId));
            embed.setDescription(`**Guess a letter** with \`!hangman <letter>\` or quit with \`!hangman quit\`.`);
            return message.reply({ embeds: [embed] });
        }

        if (guess === 'QUIT') {
            if (!activeGames.has(userId)) return message.reply('❌ No active game.');
            const g = activeGames.get(userId);
            activeGames.delete(userId);
            return message.reply(`🏳️ Game ended. The word was **${g.word}**.`);
        }

        if (!activeGames.has(userId)) {
            return message.reply('❌ No active Hangman game. Start one with `!hangman`.');
        }

        if (!/^[A-Z]$/.test(guess)) {
            return message.reply('❌ Please guess a single letter.');
        }

        const game = activeGames.get(userId);
        if (game.guessed.has(guess)) {
            return message.reply(`❌ You already guessed **${guess}**.`);
        }

        game.guessed.add(guess);
        if (!game.word.includes(guess)) game.wrong++;

        const won = [...game.word].every(l => game.guessed.has(l));
        const lost = game.wrong >= STAGES.length - 1;

        if (won || lost) activeGames.delete(userId);

        const embed = buildEmbed(game);

        if (won) {
            const prize = Math.max(100, (game.word.length * 100) - (game.wrong * 50));
            await economyManager.addMoney(message.guild.id, userId, prize);
            embed.setColor(0x57f287).addFields({ name: '🎉 You guessed it!', value: `The word was **${game.word}**!\nEarned **${prize} coins**!` });
        } else if (lost) {
            embed.setColor(0xed4245).addFields({ name: '💀 Game Over', value: `The word was **${game.word}**.` });
        } else {
            embed.setColor(game.wrong > 4 ? 0xffa500 : 0x5865f2);
        }

        await message.reply({ embeds: [embed] });
    }
};

function buildEmbed(game) {
    const display = [...game.word].map(l => game.guessed.has(l) ? l : '_').join(' ');
    const wrongLetters = [...game.guessed].filter(l => !game.word.includes(l)).join(' ') || 'None';

    return new EmbedBuilder()
        .setTitle('🪢 Hangman')
        .addFields(
            { name: '\u200b', value: STAGES[game.wrong] },
            { name: '📝 Word', value: `\`${display}\``, inline: true },
            { name: '❌ Wrong Guesses', value: wrongLetters, inline: true },
        )
        .setFooter({ text: `${STAGES.length - 1 - game.wrong} lives remaining` });
}
