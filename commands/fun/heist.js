const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const economyManager = require('../../utils/economyManager');

// Active heists: { guildId: { initiator, joinBy, participants: Set } }
const activeHeists = new Map();

module.exports = {
    name: 'heist',
    description: 'Start a cooperative heist — recruit members to rob a virtual bank!',
    usage: '!heist',
    aliases: [],
    category: 'fun',
    async execute(message, args, client) {
        const guildId = message.guild.id;

        if (activeHeists.has(guildId)) {
            return message.reply('❌ A heist is already in progress! Use the join button to participate.');
        }

        const joinWindow = 30_000; // 30 seconds to join
        const joinBy = Date.now() + joinWindow;

        const heistData = {
            initiator: message.author.id,
            joinBy,
            participants: new Set([message.author.id]),
            channelId: message.channel.id,
        };
        activeHeists.set(guildId, heistData);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`heist_join_${guildId}`)
                .setLabel('🔫 Join Heist')
                .setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🏦 Bank Heist Planning!')
            .setDescription(`${message.author} is planning a heist on the **First National Discord Bank**!\n\nClick the button to join within **30 seconds**. The more people, the higher the chance of success!`)
            .addFields({ name: '👥 Participants', value: `<@${message.author.id}>` })
            .setTimestamp();

        const msg = await message.channel.send({ embeds: [embed], components: [row] });

        // Collect join-button presses
        const collector = msg.createMessageComponentCollector({
            filter: i => i.customId === `heist_join_${guildId}`,
            time: joinWindow,
        });

        collector.on('collect', async (i) => {
            if (heistData.participants.has(i.user.id)) {
                return i.reply({ content: '❌ You already joined!', flags: 64 });
            }
            heistData.participants.add(i.user.id);
            const participantList = [...heistData.participants].map(id => `<@${id}>`).join(', ');
            const updatedEmbed = EmbedBuilder.from(embed).setFields({ name: '👥 Participants', value: participantList });
            await msg.edit({ embeds: [updatedEmbed] });
            await i.reply({ content: '✅ You joined the heist!', flags: 64 });
        });

        collector.on('end', async () => {
            activeHeists.delete(guildId);
            const participants = [...heistData.participants];

            if (participants.length === 0) {
                return msg.edit({ content: '❌ Heist cancelled — no participants.', embeds: [], components: [] });
            }

            // Chance of success scales with participant count (max 85%)
            const baseChance = 0.35 + (participants.length - 1) * 0.1;
            const successChance = Math.min(baseChance, 0.85);
            const success = Math.random() < successChance;

            const baseVault = 5000 + Math.floor(Math.random() * 10000);
            const results = [];

            if (success) {
                for (const userId of participants) {
                    const share = Math.floor((baseVault / participants.length) * (0.7 + Math.random() * 0.6));
                    await economyManager.addMoney(guildId, userId, share);
                    results.push(`<@${userId}> got **${share.toLocaleString()} coins**`);
                }

                const successEmbed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('🎉 Heist Successful!')
                    .setDescription(`The crew cracked the vault and made off with **${baseVault.toLocaleString()} coins**!`)
                    .addFields({ name: '💰 Payouts', value: results.join('\n') })
                    .setTimestamp();

                await msg.edit({ embeds: [successEmbed], components: [] });
            } else {
                // Fine each participant
                for (const userId of participants) {
                    const fine = Math.floor(500 + Math.random() * 1500);
                    await economyManager.removeMoney(guildId, userId, fine);
                    results.push(`<@${userId}> was fined **${fine.toLocaleString()} coins**`);
                }

                const failEmbed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🚔 Heist Failed!')
                    .setDescription('The police caught the crew! Everyone was fined.')
                    .addFields({ name: '🚨 Fines', value: results.join('\n') })
                    .setTimestamp();

                await msg.edit({ embeds: [failEmbed], components: [] });
            }
        });
    }
};
