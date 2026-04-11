const { EmbedBuilder } = require('discord.js');
const petManager = require('../../utils/petManager');
const economyManager = require('../../utils/economyManager');

const FEED_COST = 50;

function statusBar(value, max = 100, size = 10) {
    const filled = Math.round((value / max) * size);
    return '🟩'.repeat(filled) + '⬜'.repeat(size - filled);
}

module.exports = {
    name: 'pet',
    description: 'Adopt and care for a virtual pet',
    usage: '!pet adopt <type> [name] | !pet view | !pet feed | !pet play | !pet release | !pet types',
    aliases: ['pets'],
    category: 'fun',
    async execute(message, args, client) {
        const sub = (args[0] || 'view').toLowerCase();
        const guildId = message.guild.id;
        const userId = message.author.id;

        if (sub === 'types') {
            const types = petManager.getTypes();
            const desc = Object.entries(types)
                .map(([key, t]) => `${t.emoji} **${t.name}** (\`${key}\`)`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🐾 Available Pet Types')
                .setDescription(desc);
            return message.reply({ embeds: [embed] });
        }

        if (sub === 'adopt') {
            const type = (args[1] || '').toLowerCase();
            const name = args.slice(2).join(' ') || null;
            try {
                const pet = await petManager.adopt(guildId, userId, type, name);
                const typeInfo = petManager.getTypeInfo(type);
                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle(`${typeInfo.emoji} You adopted a pet!`)
                    .setDescription(`**${pet.name}** is now your companion!`)
                    .addFields(
                        { name: '🍖 Hunger', value: statusBar(pet.hunger), inline: true },
                        { name: '😊 Happiness', value: statusBar(pet.happiness), inline: true },
                    );
                return message.reply({ embeds: [embed] });
            } catch (err) {
                if (err.message === 'Already has a pet') return message.reply('❌ You already have a pet! Use `!pet release` first.');
                if (err.message === 'Unknown pet type') return message.reply(`❌ Unknown pet type. Use \`!pet types\` to see options.`);
                throw err;
            }
        }

        if (sub === 'view') {
            const pet = petManager.getPet(guildId, userId);
            if (!pet) return message.reply('❌ You don\'t have a pet. Adopt one with `!pet adopt <type>`.');
            const typeInfo = petManager.getTypeInfo(pet.type);
            const mood = pet.happiness >= 70 ? '😊 Happy' : pet.happiness >= 40 ? '😐 Okay' : '😢 Sad';
            const fed = pet.hunger >= 70 ? '🍖 Full' : pet.hunger >= 30 ? '😋 Peckish' : '😫 Starving';
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`${typeInfo?.emoji || '🐾'} ${pet.name}`)
                .addFields(
                    { name: '🍖 Hunger', value: `${statusBar(pet.hunger)} ${fed}`, inline: false },
                    { name: '😊 Happiness', value: `${statusBar(pet.happiness)} ${mood}`, inline: false },
                    { name: '⭐ Level', value: `${pet.level}`, inline: true },
                    { name: '✨ XP', value: `${pet.xp % 100}/100`, inline: true },
                )
                .setFooter({ text: `Use !pet feed (costs ${FEED_COST} coins) or !pet play` });
            return message.reply({ embeds: [embed] });
        }

        if (sub === 'feed') {
            const pet = petManager.getPet(guildId, userId);
            if (!pet) return message.reply('❌ You don\'t have a pet.');
            const userData = economyManager.getUserData(guildId, userId);
            if (userData.balance < FEED_COST) return message.reply(`❌ You need **${FEED_COST} coins** to feed your pet!`);
            const result = await petManager.feed(guildId, userId);
            if (result.alreadyFull) return message.reply('🍖 Your pet is already full!');
            await economyManager.removeMoney(guildId, userId, FEED_COST);
            const typeInfo = petManager.getTypeInfo(result.pet.type);
            return message.reply(`${typeInfo?.emoji || '🐾'} **${result.pet.name}** happily munches on their meal! (-${FEED_COST} coins)\n🍖 Hunger: ${statusBar(result.pet.hunger)}`);
        }

        if (sub === 'play') {
            const result = await petManager.play(guildId, userId).catch(err => {
                if (err.message === 'No pet') return null;
                throw err;
            });
            if (!result) return message.reply('❌ You don\'t have a pet.');
            if (result.cooldown) {
                const mins = Math.ceil(result.remaining / 60000);
                return message.reply(`🎾 Your pet is tired! Wait **${mins} min** before playing again.`);
            }
            const typeInfo = petManager.getTypeInfo(result.pet.type);
            return message.reply(`${typeInfo?.emoji || '🐾'} You played with **${result.pet.name}**! 😊\nHappiness: ${statusBar(result.pet.happiness)}`);
        }

        if (sub === 'release') {
            const released = await petManager.release(guildId, userId);
            if (!released) return message.reply('❌ You don\'t have a pet.');
            return message.reply('👋 Your pet has been released. They\'ll miss you!');
        }

        return message.reply('❌ Usage: `!pet adopt <type> [name]` | `!pet view` | `!pet feed` | `!pet play` | `!pet release` | `!pet types`');
    }
};
