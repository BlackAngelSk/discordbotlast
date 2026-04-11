const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const PREY = [
    { name: 'Mouse', emoji: '🐭', rarity: 'common', value: [10, 40] },
    { name: 'Rabbit', emoji: '🐰', rarity: 'common', value: [30, 80] },
    { name: 'Fox', emoji: '🦊', rarity: 'uncommon', value: [80, 160] },
    { name: 'Deer', emoji: '🦌', rarity: 'uncommon', value: [120, 250] },
    { name: 'Boar', emoji: '🐗', rarity: 'rare', value: [300, 600] },
    { name: 'Wolf', emoji: '🐺', rarity: 'rare', value: [400, 700] },
    { name: 'Bear', emoji: '🐻', rarity: 'epic', value: [700, 1200] },
    { name: 'Dragon (miniature)', emoji: '🐉', rarity: 'legendary', value: [2000, 5000] },
];

const FAIL_EVENTS = [
    { msg: 'The prey escaped into the woods!', fine: 0 },
    { msg: 'You tripped and scared everything away.', fine: 0 },
    { msg: 'A bear chased you — you lost some gear!', fine: 200 },
];

const WEIGHTS = { common: 40, uncommon: 30, rare: 18, epic: 10, legendary: 2 };
const RARITY_COLORS = { common: 0x2ecc71, uncommon: 0x3498db, rare: 0x9b59b6, epic: 0xe67e22, legendary: 0xf1c40f };

const huntCooldowns = new Map();
const COOLDOWN_MS = 45_000;

function weightedPick() {
    const pool = [];
    for (const prey of PREY) {
        for (let i = 0; i < WEIGHTS[prey.rarity]; i++) pool.push(prey);
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
    name: 'hunt',
    description: 'Go hunting and earn coins',
    usage: '!hunt',
    aliases: ['hunting'],
    category: 'fun',
    async execute(message, args, client) {
        const userId = message.author.id;
        const now = Date.now();
        const lastHunt = huntCooldowns.get(userId) || 0;

        if (now - lastHunt < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - lastHunt)) / 1000);
            return message.reply(`🏹 You need to rest before hunting again! Wait **${remaining}s**.`);
        }
        huntCooldowns.set(userId, now);

        const thinkMsg = await message.reply('🏹 You head into the forest...');
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

        // 70% chance of success
        const success = Math.random() < 0.70;

        if (!success) {
            const fail = FAIL_EVENTS[Math.floor(Math.random() * FAIL_EVENTS.length)];
            if (fail.fine > 0) {
                await economyManager.removeMoney(message.guild.id, userId, fail.fine);
            }
            return thinkMsg.edit({ content: `🏹 Hunt failed! ${fail.msg}${fail.fine ? ` You lost **${fail.fine} coins**.` : ''}` });
        }

        const prey = weightedPick();
        const value = Math.floor(prey.value[0] + Math.random() * (prey.value[1] - prey.value[0]));
        await economyManager.addMoney(message.guild.id, userId, value);

        const rarityLabels = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: '✨ LEGENDARY' };

        const embed = new EmbedBuilder()
            .setColor(RARITY_COLORS[prey.rarity])
            .setTitle('🏹 Successful Hunt!')
            .setDescription(`${prey.emoji} **${prey.name}**\n*${rarityLabels[prey.rarity]}*`)
            .addFields({ name: '💰 Earned', value: `${value.toLocaleString()} coins`, inline: true })
            .setFooter({ text: 'Come back in 45 seconds for another hunt!' })
            .setTimestamp();

        await thinkMsg.edit({ content: null, embeds: [embed] });
    }
};
