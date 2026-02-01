const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const giveawayFile = path.join(__dirname, '../../data/giveaways.json');

// Ensure giveaways file exists
if (!fs.existsSync(giveawayFile)) {
    fs.writeFileSync(giveawayFile, JSON.stringify([], null, 2));
}

function loadGiveaways() {
    try {
        return JSON.parse(fs.readFileSync(giveawayFile, 'utf8'));
    } catch {
        return [];
    }
}

function saveGiveaways(giveaways) {
    fs.writeFileSync(giveawayFile, JSON.stringify(giveaways, null, 2));
}

function parseTime(timeString) {
    const regex = /(\d+)([smhd])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(timeString)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': totalMs += value * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
        }
    }

    return totalMs;
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function endGiveaway(client, giveaway) {
    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(giveaway.messageId);
        
        const reaction = message.reactions.cache.get('🎉');
        if (!reaction) {
            return message.reply('❌ No one entered the giveaway!');
        }

        const users = await reaction.users.fetch();
        const participants = users.filter(user => !user.bot);

        if (participants.size === 0) {
            const endEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🎉 Giveaway Ended')
                .setDescription(`**Prize:** ${giveaway.prize}\n\n❌ No valid entries!`)
                .setFooter({ text: 'Giveaway ended' })
                .setTimestamp();

            await message.edit({ embeds: [endEmbed] });
            return;
        }

        const winnersCount = Math.min(giveaway.winners, participants.size);
        const participantArray = Array.from(participants.values());
        const winners = [];

        for (let i = 0; i < winnersCount; i++) {
            const randomIndex = Math.floor(Math.random() * participantArray.length);
            winners.push(participantArray.splice(randomIndex, 1)[0]);
        }

        const winnerMentions = winners.map(w => `<@${w.id}>`).join(', ');

        const endEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Giveaway Ended')
            .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner(s):** ${winnerMentions}`)
            .setFooter({ text: `Ended at` })
            .setTimestamp();

        await message.edit({ embeds: [endEmbed] });
        await message.reply(`🎊 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`);

    } catch (error) {
        console.error('Error ending giveaway:', error);
    }
}

module.exports = {
    name: 'giveaway',
    description: 'Create a giveaway',
    usage: '!giveaway <time> <winners> <prize>',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need the Manage Server permission to create giveaways!');
        }

        if (args.length < 3) {
            return message.reply('❌ Usage: `!giveaway <time> <winners> <prize>`\nExample: `!giveaway 1h 2 Discord Nitro`\nTime format: s=seconds, m=minutes, h=hours, d=days');
        }

        const timeString = args[0];
        const winnersCount = parseInt(args[1]);
        const prize = args.slice(2).join(' ');

        const duration = parseTime(timeString);
        
        if (!duration || duration < 1000) {
            return message.reply('❌ Invalid time format! Use format like: 30s, 5m, 1h, 2d');
        }

        if (isNaN(winnersCount) || winnersCount < 1) {
            return message.reply('❌ Winners must be a positive number!');
        }

        if (!prize) {
            return message.reply('❌ Please specify a prize!');
        }

        const endTime = Date.now() + duration;

        const giveawayEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎉 GIVEAWAY 🎉')
            .setDescription(`**Prize:** ${prize}\n\n**Winners:** ${winnersCount}\n**Hosted by:** ${message.author}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
            .setFooter({ text: 'React with 🎉 to enter!' })
            .setTimestamp(endTime);

        const giveawayMessage = await message.channel.send({ embeds: [giveawayEmbed] });
        await giveawayMessage.react('🎉');

        const giveaway = {
            messageId: giveawayMessage.id,
            channelId: message.channel.id,
            guildId: message.guild.id,
            prize: prize,
            winners: winnersCount,
            endTime: endTime,
            hostId: message.author.id
        };

        const giveaways = loadGiveaways();
        giveaways.push(giveaway);
        saveGiveaways(giveaways);

        // Set timeout to end giveaway
        setTimeout(() => {
            endGiveaway(client, giveaway);
            
            // Remove from active giveaways
            const updatedGiveaways = loadGiveaways().filter(g => g.messageId !== giveaway.messageId);
            saveGiveaways(updatedGiveaways);
        }, duration);

        await message.reply(`✅ Giveaway created! It will end in ${formatTime(duration)}.`);
    }
};

// Function to restart active giveaways on bot restart
module.exports.restartGiveaways = async function(client) {
    const giveaways = loadGiveaways();
    const now = Date.now();
    const updatedGiveaways = [];

    for (const giveaway of giveaways) {
        const timeLeft = giveaway.endTime - now;

        if (timeLeft <= 0) {
            // End immediately if time already passed
            await endGiveaway(client, giveaway);
        } else {
            // Schedule to end at the right time
            updatedGiveaways.push(giveaway);
            setTimeout(() => {
                endGiveaway(client, giveaway);
                const current = loadGiveaways().filter(g => g.messageId !== giveaway.messageId);
                saveGiveaways(current);
            }, timeLeft);
        }
    }

    saveGiveaways(updatedGiveaways);
};
