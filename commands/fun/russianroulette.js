const economyManager = require('../../utils/economyManager');

const rouletteData = new Map(); // Track active games
const mutedUsers = new Map(); // Track muted users

const consequences = [
    {
        name: 'Chat Mute',
        emoji: '🔇',
        description: 'Muted for 30 seconds!',
        execute: async (message, userId) => {
            mutedUsers.set(userId, Date.now() + 30000); // 30 seconds
            return '🔇 **MUTED for 30 seconds!** No messages allowed!';
        }
    },
    {
        name: 'Lose Currency',
        emoji: '💸',
        description: 'Lost 100 coins',
        execute: async (message, userId) => {
            await economyManager.removeBalance(message.guildId, userId, 100);
            return '💸 **OUCH!** Lost 100 coins!';
        }
    },
    {
        name: 'Funny Nickname',
        emoji: '🎭',
        description: 'Nickname changed to "Loser"',
        execute: async (message, userId) => {
            try {
                const member = await message.guild.members.fetch(userId);
                await member.setNickname('🎭 Loser');
                setTimeout(() => {
                    member.setNickname(null).catch(() => {});
                }, 20000); // Reset after 20 seconds
                return '🎭 **Your nickname is now "🎭 Loser"!** (20 seconds)';
            } catch (e) {
                return '🎭 **You lost!** (Couldn\'t change nickname)';
            }
        }
    },
    {
        name: 'Timeout Penalty',
        emoji: '⏱️',
        description: 'Timed out for 10 seconds',
        execute: async (message, userId) => {
            try {
                const member = await message.guild.members.fetch(userId);
                await member.timeout(10000); // 10 seconds
                return '⏱️ **TIMEOUT!** You\'re muted for 10 seconds!';
            } catch (e) {
                return '⏱️ **TIMEOUT penalty applied!** (Couldn\'t timeout)';
            }
        }
    },
    {
        name: 'Win Currency',
        emoji: '💰',
        description: 'Won 150 coins!',
        execute: async (message, userId) => {
            await economyManager.addBalance(message.guildId, userId, 150);
            return '💰 **JACKPOT!** You won 150 coins!';
        }
    },
    {
        name: 'Delete Message',
        emoji: '🗑️',
        description: 'Your message will be deleted',
        execute: async (message, userId) => {
            try {
                await message.delete();
            } catch (e) {}
            return '🗑️ **OOPS!** Your message was deleted!';
        }
    },
    {
        name: 'Emoji Reaction Curse',
        emoji: '😱',
        description: 'Must react with 🍆 to your next message',
        execute: async (message, userId) => {
            return '😱 **CURSED!** You must react with 🍆 to your next message or lose 50 coins!';
        }
    }
];

module.exports = {
    name: 'russianroulette',
    description: 'Play Russian Roulette - 1 in 7 chance to lose!',
    aliases: ['rr', 'rusroulette'],
    async execute(message, args, client) {
        const userId = message.author.id;
        const guildId = message.guildId;

        // Check if user is muted
        if (mutedUsers.has(userId)) {
            const muteExpire = mutedUsers.get(userId);
            if (Date.now() < muteExpire) {
                const timeLeft = Math.ceil((muteExpire - Date.now()) / 1000);
                return message.reply(`🔇 You're muted for ${timeLeft} more seconds!`);
            } else {
                mutedUsers.delete(userId);
            }
        }

        // Prevent spam
        const key = `${guildId}_${userId}`;
        if (rouletteData.has(key)) {
            return message.reply('⏳ Please wait 5 seconds before playing again!');
        }

        rouletteData.set(key, true);
        setTimeout(() => rouletteData.delete(key), 5000); // 5 second cooldown

        // Spin the roulette
        const result = Math.floor(Math.random() * consequences.length);
        const consequence = consequences[result];

        // Execute consequence
        const resultMessage = await consequence.execute(message, userId);

        const embed = {
            color: result === 4 ? 0x00FF00 : 0xFF0000,
            title: `🎡 Russian Roulette Spin! ${consequence.emoji}`,
            description: resultMessage,
            fields: [
                {
                    name: 'Consequence',
                    value: consequence.name,
                    inline: true
                },
                {
                    name: 'Odds',
                    value: '1 in 7 (14.3%)',
                    inline: true
                }
            ],
            footer: {
                text: '🎲 Will you survive? Use the command again!'
            }
        };

        await message.reply({ embeds: [embed] });

        // Check for emoji reaction consequence
        if (consequence.name === 'Emoji Reaction Curse') {
            const collector = message.channel.createMessageCollector({
                filter: (msg) => msg.author.id === userId,
                time: 120000, // 2 minutes
                max: 1
            });

            collector.on('collect', async (msg) => {
                try {
                    const hasEmoji = msg.content.includes('🍆');
                    if (hasEmoji) {
                        await msg.reply('✅ **Crisis averted!** You reacted correctly!');
                    } else {
                        economyManager.removeBalance(guildId, userId, 50);
                        await msg.reply('❌ **Wrong reaction!** Lost 50 coins!');
                    }
                } catch (e) {
                    console.error('Error in emoji reaction:', e);
                }
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await economyManager.removeBalance(guildId, userId, 50);
                    message.channel.send(`⏰ **${message.author.username}** didn't react in time! Lost 50 coins!`);
                }
            });
        }
    }
};
