const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('horserace')
        .setDescription('Bet on a horse race (1-5). Win big if your horse wins!')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10))
        .addStringOption(option =>
            option.setName('course')
                .setDescription('Race course length')
                .setRequired(false)
                .addChoices(
                    { name: 'Short', value: 'short' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Long', value: 'long' }
                )),
    
    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const courseArg = (interaction.options.getString('course') || 'medium').toLowerCase();

            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }

            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);

            const horses = [1, 2, 3, 4, 5];
            const emojis = {
                1: '1️⃣',
                2: '2️⃣',
                3: '3️⃣',
                4: '4️⃣',
                5: '5️⃣'
            };

            const courses = {
                short: { trackLen: 8, multiplier: 3 },
                medium: { trackLen: 12, multiplier: 4 },
                long: { trackLen: 16, multiplier: 6 }
            };
            const course = courses[courseArg] ? courseArg : 'medium';
            const trackLen = courses[course].trackLen;
            const payoutMultiplier = courses[course].multiplier;

            const horseStats = await horseRaceManager.getHorseStats(interaction.guild.id, course);

            const winRates = {};
            let minRate = Infinity;
            let maxRate = -Infinity;
            for (let h = 1; h <= 5; h++) {
                const w = horseStats[h].wins;
                const l = horseStats[h].losses;
                const total = w + l;
                const rate = (w + 1) / (total + 2);
                winRates[h] = rate;
                minRate = Math.min(minRate, rate);
                maxRate = Math.max(maxRate, rate);
            }

            const oddsMultipliers = {};
            const hasVariance = maxRate > minRate;
            for (let h = 1; h <= 5; h++) {
                if (!hasVariance) {
                    oddsMultipliers[h] = 1.0;
                } else {
                    const normalized = (winRates[h] - minRate) / (maxRate - minRate);
                    oddsMultipliers[h] = +(1.6 - normalized * 0.8).toFixed(2);
                }
            }

            const bestHorse = Object.keys(winRates).reduce((a, b) => (winRates[a] > winRates[b] ? a : b));
            const worstHorse = Object.keys(winRates).reduce((a, b) => (winRates[a] < winRates[b] ? a : b));

            const winnerWeights = {};
            let weightSum = 0;
            for (let h = 1; h <= 5; h++) {
                let weight = winRates[h];
                if (hasVariance) {
                    weight = Math.pow(weight, 2);
                }
                if (String(h) === String(bestHorse)) {
                    weight *= 1.15;
                }
                winnerWeights[h] = weight;
                weightSum += weight;
            }

            let courseInfo = `**Course: ${course.toUpperCase()}**\n`;
            courseInfo += `🏇 Track Length: ${trackLen}\n`;
            courseInfo += `💰 Payout Multiplier: ${payoutMultiplier}x\n\n`;
            courseInfo += `**Chances (This Course):**\n`;
            courseInfo += `✅ Best chance: ${emojis[bestHorse]} Horse ${bestHorse}\n`;
            courseInfo += `⚠️ Worst chance: ${emojis[worstHorse]} Horse ${worstHorse}\n`;
            courseInfo += `\n**Payout Odds Bonus:**\n`;
            for (let h = 1; h <= 5; h++) {
                courseInfo += `${emojis[h]} Horse ${h}: ${oddsMultipliers[h]}x\n`;
            }
            courseInfo += `\n**Available Courses:**\n`;
            for (const [cName, cData] of Object.entries(courses)) {
                const marker = cName === course ? '✓' : '•';
                courseInfo += `${marker} **${cName}**: ${cData.trackLen} track, ${cData.multiplier}x payout\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🏁 Horse Race')
                .setDescription(`Place your bet and pick a horse! (Bet: ${bet} coins)\n\n${courseInfo}`)
                .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(interaction.guild.id, interaction.user.id).balance}` });

            const row = new ActionRowBuilder().addComponents(
                horses.map(h => new ButtonBuilder()
                    .setCustomId(`horse_${h}`)
                    .setLabel(String(h))
                    .setEmoji(emojis[h])
                    .setStyle(ButtonStyle.Primary)
                )
            );

            const gameMessage = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

            const collector = gameMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30000,
                filter: (i) => i.user.id === interaction.user.id
            });

            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();
                } catch (err) {
                    if (err && err.code === 10062) {
                        return;
                    }
                }

                const choice = parseInt(i.customId.replace('horse_', ''));
                let roll = Math.random() * weightSum;
                let chosenWinner = 1;
                for (const h of horses) {
                    roll -= winnerWeights[h];
                    if (roll <= 0) {
                        chosenWinner = h;
                        break;
                    }
                }

                const positions = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

                const raceEmbed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🏁 Horse Race — Running...')
                    .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(interaction.guild.id, interaction.user.id).balance}` });

                while (positions[chosenWinner] < trackLen) {
                    for (const h of horses) {
                        const step = (h === chosenWinner) ? (Math.floor(Math.random() * 2) + 1) : Math.floor(Math.random() * 2);
                        positions[h] = Math.min(trackLen, positions[h] + step);
                    }

                    let trackText = '```' + '\n' + 'Finish' + '\n';
                    for (const h of horses) {
                        const pos = positions[h];
                        const left = '·'.repeat(Math.max(0, pos));
                        const right = '·'.repeat(Math.max(0, trackLen - pos));
                        trackText += `${emojis[h]} |${left}🏇${right}|\n`;
                    }
                    trackText += '```';

                    raceEmbed.setDescription(`Bet: ${bet} coins\n\n${trackText}`);

                    try {
                        await i.editReply({ embeds: [raceEmbed], components: [] });
                    } catch (e) {
                        try {
                            await gameMessage.edit({ embeds: [raceEmbed], components: [] });
                        } catch (e2) {
                            // ignore
                        }
                    }

                    await sleep(700);
                }

                const winner = chosenWinner;
                let payout = 0;
                if (choice === winner) {
                    const oddsBonus = oddsMultipliers[choice] || 1.0;
                    payout = Math.floor(bet * payoutMultiplier * oddsBonus);
                    await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
                }

                try {
                    await horseRaceManager.addRecord({
                        guildId: interaction.guild.id,
                        userId: interaction.user.id,
                        bet,
                        payout: choice === winner ? payout : 0,
                        choice,
                        winner,
                        course,
                        timestamp: new Date().toISOString()
                    });
                } catch (err) {
                    console.error('Failed to save horse race record:', err);
                }

                const updatedStats = await horseRaceManager.getHorseStats(interaction.guild.id, course);
                let statsText = '**Horse Records** (W-L):\n';
                for (let h = 1; h <= 5; h++) {
                    const w = updatedStats[h].wins;
                    const l = updatedStats[h].losses;
                    const total = w + l;
                    const wr = total > 0 ? ((w / total) * 100).toFixed(1) : 0;
                    statsText += `${emojis[h]} ${w}W-${l}L (${wr}%)\n`;
                }

                let resultEmbed;
                if (choice === winner) {
                    resultEmbed = new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle('🏆 You Won the Horse Race!')
                        .setDescription(`Your horse ${emojis[choice]} came in first!\n\nCourse: **${course}**\nYou won **${payout}** coins.`)
                        .addFields(
                            { name: 'Your Pick', value: `${emojis[choice]} Horse ${choice}`, inline: true },
                            { name: 'Winner', value: `${emojis[winner]} Horse ${winner}`, inline: true },
                            { name: 'Odds Bonus', value: `${oddsMultipliers[choice] || 1.0}x`, inline: true },
                            { name: 'New Balance', value: `💰 ${economyManager.getUserData(interaction.guild.id, interaction.user.id).balance} coins`, inline: false },
                            { name: 'Stats (This Course)', value: statsText, inline: false }
                        );
                } else {
                    resultEmbed = new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle('😢 You Lost the Horse Race')
                        .setDescription(`Your horse ${emojis[choice]} did not win. Better luck next time!\n\nCourse: **${course}**\n-${bet} coins.`)
                        .addFields(
                            { name: 'Your Pick', value: `${emojis[choice]} Horse ${choice}`, inline: true },
                            { name: 'Winner', value: `${emojis[winner]} Horse ${winner}`, inline: true },
                            { name: 'Odds Bonus', value: `${oddsMultipliers[choice] || 1.0}x`, inline: true },
                            { name: 'New Balance', value: `💰 ${economyManager.getUserData(interaction.guild.id, interaction.user.id).balance} coins`, inline: false },
                            { name: 'Stats (This Course)', value: statsText, inline: false }
                        );
                }

                try {
                    await i.editReply({ embeds: [resultEmbed], components: [] });
                } catch (e) {
                    try {
                        await gameMessage.edit({ embeds: [resultEmbed], components: [] });
                    } catch (e2) {
                        // ignore
                    }
                }

                collector.stop('finished');
            });

            collector.on('end', async (_c, reason) => {
                if (reason !== 'finished') {
                    try {
                        await gameMessage.edit({ components: [] });
                    } catch (e) {
                        // ignore
                    }
                }
            });
        } catch (error) {
            console.error('Error in horserace command:', error);
            try {
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ An error occurred while playing horse race!', flags: [4096] });
                } else {
                    await interaction.editReply({ content: '❌ An error occurred while playing horse race!' });
                }
            } catch (e) {
                console.error('Failed to send error response:', e.message);
            }
        }
    }
};
