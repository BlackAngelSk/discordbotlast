const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const rouletteData = new Map(); // Track active games
const mutedUsers = new Map(); // Track muted users

const consequences = [
    {
        name: 'Chat Mute',
        emoji: '🔇',
        description: 'Muted for 30 seconds!',
        execute: async (interaction, userId) => {
            mutedUsers.set(userId, Date.now() + 30000); // 30 seconds
            return '🔇 **MUTED for 30 seconds!** No messages allowed!';
        }
    },
    {
        name: 'Lose Currency',
        emoji: '💸',
        description: 'Lost 100 coins',
        execute: async (interaction, userId) => {
            economyManager.removeBalance(interaction.guildId, userId, 100);
            return '💸 **OUCH!** Lost 100 coins!';
        }
    },
    {
        name: 'Funny Nickname',
        emoji: '🎭',
        description: 'Nickname changed to "Loser"',
        execute: async (interaction, userId) => {
            try {
                const member = await interaction.guild.members.fetch(userId);
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
        execute: async (interaction, userId) => {
            try {
                const member = await interaction.guild.members.fetch(userId);
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
        execute: async (interaction, userId) => {
            economyManager.addBalance(interaction.guildId, userId, 150);
            return '💰 **JACKPOT!** You won 150 coins!';
        }
    },
    {
        name: 'Delete Interaction',
        emoji: '🗑️',
        description: 'Command will be deleted',
        execute: async (interaction, userId) => {
            return '🗑️ **OOPS!** This will be deleted in 5 seconds!';
        }
    },
    {
        name: 'Emoji Curse',
        emoji: '😱',
        description: 'You must use 🍆 emoji in your next message',
        execute: async (interaction, userId) => {
            return '😱 **CURSED!** You must use 🍆 emoji in your next message or lose 50 coins!';
        }
    }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian Roulette - 1 in 7 chance to lose!'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // Check if user is muted
        if (mutedUsers.has(userId)) {
            const muteExpire = mutedUsers.get(userId);
            if (Date.now() < muteExpire) {
                const timeLeft = Math.ceil((muteExpire - Date.now()) / 1000);
                return interaction.reply({
                    content: `🔇 You're muted for ${timeLeft} more seconds!`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                mutedUsers.delete(userId);
            }
        }

        // Prevent spam
        const key = `${guildId}_${userId}`;
        if (rouletteData.has(key)) {
            return interaction.reply({
                content: '⏳ Please wait before playing again!',
                flags: MessageFlags.Ephemeral
            });
        }

        rouletteData.set(key, true);
        setTimeout(() => rouletteData.delete(key), 5000); // 5 second cooldown

        // Spin the roulette
        const result = Math.floor(Math.random() * consequences.length);
        const consequence = consequences[result];

        // Execute consequence
        const resultMessage = await consequence.execute(interaction, userId);

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
                    value: '1 in 7',
                    inline: true
                }
            ]
        };

        await interaction.reply({ embeds: [embed] });
    }
};
