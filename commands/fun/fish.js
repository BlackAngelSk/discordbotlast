const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const FISH = [
    { name: 'Old Boot', emoji: '👢', rarity: 'junk', value: [0, 5] },
    { name: 'Seaweed', emoji: '🌿', rarity: 'junk', value: [1, 10] },
    { name: 'Common Carp', emoji: '🐟', rarity: 'common', value: [20, 60] },
    { name: 'Bass', emoji: '🐠', rarity: 'common', value: [30, 80] },
    { name: 'Trout', emoji: '🐡', rarity: 'uncommon', value: [80, 150] },
    { name: 'Salmon', emoji: '🐟', rarity: 'uncommon', value: [100, 200] },
    { name: 'Swordfish', emoji: '🗡️', rarity: 'rare', value: [300, 500] },
    { name: 'Golden Fish', emoji: '✨', rarity: 'rare', value: [500, 800] },
    { name: 'Shark', emoji: '🦈', rarity: 'epic', value: [800, 1500] },
    { name: 'Legendary Koi', emoji: '🐉', rarity: 'legendary', value: [2000, 5000] },
];

const WEIGHTS = { junk: 25, common: 35, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_COLORS = { junk: 0x7f8c8d, common: 0x2ecc71, uncommon: 0x3498db, rare: 0x9b59b6, epic: 0xe67e22, legendary: 0xf1c40f };

const fishCooldowns = new Map();
const COOLDOWN_MS = 30_000;

function weightedPick() {
    const pool = [];
    for (const fish of FISH) {
        for (let i = 0; i < WEIGHTS[fish.rarity]; i++) pool.push(fish);
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
    name: 'fish',
    description: 'Go fishing and earn coins',
    usage: '!fish',
    aliases: ['fishing', 'cast'],
    category: 'fun',
    async execute(message, args, client) {
        const userId = message.author.id;
        const now = Date.now();
        const lastFish = fishCooldowns.get(userId) || 0;

        if (now - lastFish < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - lastFish)) / 1000);
            return message.reply(`🎣 Your line is still in the water! Wait **${remaining}s**.`);
        }
        fishCooldowns.set(userId, now);

        // Simulate casting
        const thinkMsg = await message.reply('🎣 Casting your line...');
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

        const fish = weightedPick();
        const value = Math.floor(fish.value[0] + Math.random() * (fish.value[1] - fish.value[0]));
        await economyManager.addMoney(message.guild.id, userId, value);

        const rarityLabels = { junk: 'Junk', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: '✨ LEGENDARY' };

        const embed = new EmbedBuilder()
            .setColor(RARITY_COLORS[fish.rarity])
            .setTitle(`🎣 You caught something!`)
            .setDescription(`${fish.emoji} **${fish.name}**\n*${rarityLabels[fish.rarity]}*`)
            .addFields({ name: '💰 Sold for', value: `${value.toLocaleString()} coins`, inline: true })
            .setFooter({ text: 'Come back in 30 seconds for another cast!' })
            .setTimestamp();

        await thinkMsg.edit({ content: null, embeds: [embed] });
    }
};
