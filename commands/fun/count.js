const countingData = new Map();

module.exports = {
    name: 'count',
    description: 'Start a counting game in the channel',
    async execute(message, args, client) {
        const channelId = message.channelId;
        const guildId = message.guildId;
        const key = `${guildId}_${channelId}`;

        if (countingData.has(key)) {
            return message.reply('⚠️ A counting game is already active in this channel!');
        }

        // Initialize counting game
        countingData.set(key, {
            currentNumber: 0,
            lastUserId: null,
            lastUsername: null,
            players: new Set(),
            startTime: Date.now(),
            gameActive: true
        });

        await message.reply('🎮 **Counting Game Started!**\n\n**How to play:**\n- Users count sequentially: 1, 2, 3, 4...\n- Each user must count after a different user\n- First to mess up ends the game!\n\nReady? Start counting with `1`!');

        // Listen for messages in this channel
        const messageCollector = message.channel.createMessageCollector({ 
            filter: (msg) => !msg.author.bot,
            time: 3600000 // 1 hour timeout
        });

        messageCollector.on('collect', async (msg) => {
            const gameState = countingData.get(key);
            if (!gameState || !gameState.gameActive) {
                messageCollector.stop();
                return;
            }

            const userMessage = msg.content.trim();
            const expectedNumber = gameState.currentNumber + 1;

            // Check if message is just a number
            if (!/^\d+$/.test(userMessage)) {
                return; // Ignore non-number messages
            }

            const userNumber = parseInt(userMessage);

            // Check if number is correct
            if (userNumber !== expectedNumber) {
                gameState.gameActive = false;
                messageCollector.stop();
                countingData.delete(key);

                const embed = {
                    color: 0xFF0000,
                    title: '❌ Counting Game Over!',
                    description: `**${msg.author.username}** broke the sequence!`,
                    fields: [
                        {
                            name: 'Expected Number',
                            value: `${expectedNumber}`,
                            inline: true
                        },
                        {
                            name: 'Got',
                            value: `${userNumber}`,
                            inline: true
                        },
                        {
                            name: 'Final Count',
                            value: `${gameState.currentNumber}`,
                            inline: true
                        },
                        {
                            name: 'Duration',
                            value: `${Math.floor((Date.now() - gameState.startTime) / 1000)}s`,
                            inline: true
                        },
                        {
                            name: 'Players Participated',
                            value: `${gameState.players.size}`,
                            inline: true
                        }
                    ]
                };

                return msg.reply({ embeds: [embed] });
            }

            // Check if same user is counting twice in a row
            if (gameState.lastUserId === msg.author.id) {
                gameState.gameActive = false;
                messageCollector.stop();
                countingData.delete(key);

                const embed = {
                    color: 0xFF0000,
                    title: '❌ Counting Game Over!',
                    description: `**${msg.author.username}** counted twice in a row!`,
                    fields: [
                        {
                            name: 'Final Count',
                            value: `${gameState.currentNumber}`,
                            inline: true
                        },
                        {
                            name: 'Duration',
                            value: `${Math.floor((Date.now() - gameState.startTime) / 1000)}s`,
                            inline: true
                        },
                        {
                            name: 'Players Participated',
                            value: `${gameState.players.size}`,
                            inline: true
                        }
                    ]
                };

                return msg.reply({ embeds: [embed] });
            }

            // Valid count
            gameState.currentNumber = userNumber;
            gameState.lastUserId = msg.author.id;
            gameState.lastUsername = msg.author.username;
            gameState.players.add(msg.author.id);

            // Add reaction to show valid count
            try {
                await msg.react('✅');
            } catch (error) {
                // Ignore reaction errors
            }
        });

        messageCollector.on('end', () => {
            const gameState = countingData.get(key);
            if (gameState && gameState.gameActive) {
                gameState.gameActive = false;
                countingData.delete(key);
                message.channel.send('⏱️ Counting game timed out! (60 minutes)');
            }
        });
    }
};
