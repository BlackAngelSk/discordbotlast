const fs = require('fs');
const path = require('path');

const COUNTING_DATA_FILE = path.join(__dirname, '../../data/countingGames.json');

function loadCountingData() {
    try {
        if (!fs.existsSync(COUNTING_DATA_FILE)) {
            return new Map();
        }

        const raw = fs.readFileSync(COUNTING_DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const map = new Map();

        for (const [key, value] of Object.entries(parsed)) {
            map.set(key, {
                currentNumber: value.currentNumber || 0,
                lastUserId: value.lastUserId || null,
                lastUsername: value.lastUsername || null,
                players: new Set(Array.isArray(value.players) ? value.players : []),
                startTime: value.startTime || Date.now(),
                gameActive: true
            });
        }

        return map;
    } catch (error) {
        return new Map();
    }
}

function saveCountingData(countingData) {
    try {
        const payload = {};

        for (const [key, state] of countingData.entries()) {
            payload[key] = {
                currentNumber: state.currentNumber,
                lastUserId: state.lastUserId,
                lastUsername: state.lastUsername,
                players: Array.from(state.players || []),
                startTime: state.startTime
            };
        }

        fs.writeFileSync(COUNTING_DATA_FILE, JSON.stringify(payload, null, 2));
    } catch (error) {
        // Ignore save errors to avoid breaking command execution
    }
}

const countingData = loadCountingData();

function formatDuration(startTime) {
    return `${Math.floor((Date.now() - startTime) / 1000)}s`;
}

function buildGameOverEmbed(title, description, gameState, extraFields = []) {
    return {
        color: 0xFF0000,
        title,
        description,
        fields: [
            ...extraFields,
            {
                name: 'Final Count',
                value: `${gameState.currentNumber}`,
                inline: true
            },
            {
                name: 'Duration',
                value: formatDuration(gameState.startTime),
                inline: true
            },
            {
                name: 'Players Participated',
                value: `${gameState.players.size}`,
                inline: true
            }
        ]
    };
}

function resetGameState(gameState) {
    gameState.currentNumber = 0;
    gameState.lastUserId = null;
    gameState.lastUsername = null;
    gameState.players.clear();
    gameState.startTime = Date.now();
}

async function handleMessage(message) {
    if (!message || !message.guildId || !message.channelId || message.author.bot) {
        return;
    }

    const key = `${message.guildId}_${message.channelId}`;
    const gameState = countingData.get(key);

    if (!gameState || !gameState.gameActive) {
        return;
    }

    const userMessage = String(message.content || '').trim();
    const expectedNumber = gameState.currentNumber + 1;

    if (!/^\d+$/.test(userMessage)) {
        return;
    }

    const userNumber = Number.parseInt(userMessage, 10);
    if (!Number.isSafeInteger(userNumber)) {
        return;
    }

    if (userNumber !== expectedNumber) {
        const embed = buildGameOverEmbed(
            '❌ Wrong Number - Game Reset!',
            `**${message.author.username}** broke the sequence. Start again from **1**.`,
            gameState,
            [
                {
                    name: 'Expected Number',
                    value: `${expectedNumber}`,
                    inline: true
                },
                {
                    name: 'Got',
                    value: `${userNumber}`,
                    inline: true
                }
            ]
        );

        resetGameState(gameState);
        saveCountingData(countingData);

        try {
            await message.reply({ embeds: [embed] });
        } catch (error) {
            // Ignore send errors if channel permissions changed mid-game
        }
        return;
    }

    if (gameState.lastUserId === message.author.id) {
        const embed = buildGameOverEmbed(
            '❌ Invalid Turn - Game Reset!',
            `**${message.author.username}** counted twice in a row. Start again from **1**.`,
            gameState
        );

        resetGameState(gameState);
        saveCountingData(countingData);

        try {
            await message.reply({ embeds: [embed] });
        } catch (error) {
            // Ignore send errors if channel permissions changed mid-game
        }
        return;
    }

    gameState.currentNumber = userNumber;
    gameState.lastUserId = message.author.id;
    gameState.lastUsername = message.author.username;
    gameState.players.add(message.author.id);
    saveCountingData(countingData);

    try {
        await message.react('✅');
    } catch (error) {
        // Ignore reaction errors
    }
}

module.exports = {
    name: 'count',
    description: 'Start a counting game in the channel',
    async execute(message, args, client) {
        const channelId = message.channelId;
        const guildId = message.guildId;
        const key = `${guildId}_${channelId}`;

        const activeGame = countingData.get(key);
        const subCommand = args?.[0]?.toLowerCase();

        if (subCommand === 'stop') {
            if (!activeGame) {
                return message.reply('⚠️ No active counting game found in this channel.');
            }

            countingData.delete(key);
            saveCountingData(countingData);
            return message.reply('🛑 Counting game stopped.');
        }

        if (activeGame) {
            return message.reply(`♻️ Counting game is active. Continue with **${activeGame.currentNumber + 1}**.`);
        }

        countingData.set(key, {
            currentNumber: 0,
            lastUserId: null,
            lastUsername: null,
            players: new Set(),
            startTime: Date.now(),
            gameActive: true
        });
        saveCountingData(countingData);

        await message.reply('🎮 **Counting Game Started!**\n\n**How to play:**\n- Users count sequentially: 1, 2, 3, 4...\n- Each user must count after a different user\n- Wrong number resets the game back to `1`\n\nReady? Start counting with `1`!\nUse `count stop` to end it manually.');
    },
    handleMessage
};
