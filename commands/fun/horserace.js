const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const horseRaceManager = require('../../utils/horseRaceManager');

module.exports = {
    name: 'horserace',
    description: 'Bet on a horse race (1-5). Win big if your horse wins!',
    usage: '!horserace <bet>',
    aliases: ['race','horses'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0]);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!horserace <bet>`');
            }

            // Check balance
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            const horses = [1,2,3,4,5];
            const emojis = {
                1: '1️⃣',
                2: '2️⃣',
                3: '3️⃣',
                4: '4️⃣',
                5: '5️⃣'
            };

            // support courses: short, medium, long
            const courseArg = (args[1] || 'medium').toLowerCase();
            const courses = {
                short: { trackLen: 8, multiplier: 3 },
                medium: { trackLen: 12, multiplier: 4 },
                long: { trackLen: 16, multiplier: 6 }
            };
            const course = courses[courseArg] ? courseArg : 'medium';
            const trackLen = courses[course].trackLen;
            const payoutMultiplier = courses[course].multiplier;

            // Get horse stats for current course
            const horseStats = await horseRaceManager.getHorseStats(message.guild.id, course);

            // Compute win rates (with a small prior so every horse has a chance)
            const winRates = {};
            let minRate = Infinity;
            let maxRate = -Infinity;
            for (let h = 1; h <= 5; h++) {
                const w = horseStats[h].wins;
                const l = horseStats[h].losses;
                const total = w + l;
                const rate = (w + 1) / (total + 2); // Laplace smoothing
                winRates[h] = rate;
                minRate = Math.min(minRate, rate);
                maxRate = Math.max(maxRate, rate);
            }

            // Odds multipliers: best chance pays less, worst chance pays more
            const oddsMultipliers = {};
            const hasVariance = maxRate > minRate;
            for (let h = 1; h <= 5; h++) {
                if (!hasVariance) {
                    oddsMultipliers[h] = 1.0;
                } else {
                    const normalized = (winRates[h] - minRate) / (maxRate - minRate); // 0 (worst) -> 1 (best)
                    oddsMultipliers[h] = +(1.6 - normalized * 0.8).toFixed(2); // worst 1.6x, best 0.8x
                }
            }

            const bestHorse = Object.keys(winRates).reduce((a, b) => (winRates[a] > winRates[b] ? a : b));
            const worstHorse = Object.keys(winRates).reduce((a, b) => (winRates[a] < winRates[b] ? a : b));

            // Build course info
            let courseInfo = `**Course: ${course.toUpperCase()}**\n`;
            courseInfo += `🏇 Track Length: ${trackLen}\n`;
            courseInfo += `💰 Payout Multiplier: ${payoutMultiplier}x\n\n`;
            courseInfo += `**Horse Records & Win Rate:**\n`;
            for (let h = 1; h <= 5; h++) {
                const w = horseStats[h].wins;
                const l = horseStats[h].losses;
                const total = w + l;
                const wr = total > 0 ? ((w / total) * 100).toFixed(1) : 'N/A';
                courseInfo += `${emojis[h]} Horse ${h}: ${w}W-${l}L (${wr}%)\n`;
            }
            courseInfo += `\n**Chances (This Course):**\n`;
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
                .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(message.guild.id, message.author.id).balance}` });

            const row = new ActionRowBuilder().addComponents(
                horses.map(h => new ButtonBuilder()
                    .setCustomId(`horse_${h}`)
                    .setLabel(String(h))
                    .setEmoji(emojis[h])
                    .setStyle(ButtonStyle.Primary)
                )
            );

            const gameMessage = await message.reply({ embeds: [embed], components: [row] });

            const collector = gameMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30000,
                filter: (i) => i.user.id === message.author.id
            });

            collector.on('collect', async (interaction) => {
                try {
                    await interaction.deferUpdate();
                } catch (err) {
                    // If the interaction is already expired/acknowledged, stop to avoid crashing
                    if (err && err.code === 10062) {
                        return;
                    }
                }
                const choice = parseInt(interaction.customId.replace('horse_', ''));

                // Pick a weighted winner based on win rates, then animate progress so the winner finishes first
                const weightSum = Object.values(winRates).reduce((sum, v) => sum + v, 0);
                let roll = Math.random() * weightSum;
                let chosenWinner = 1;
                for (const h of horses) {
                    roll -= winRates[h];
                    if (roll <= 0) {
                        chosenWinner = h;
                        break;
                    }
                }
                const positions = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

                // Remove buttons during animation by editing reply with components: []
                // We'll update the embed repeatedly to show the race
                const raceEmbed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🏁 Horse Race — Running...')
                    .setFooter({ text: `💰 Your balance: ${economyManager.getUserData(message.guild.id, message.author.id).balance}` });

                // Animation loop — continue until chosenWinner reaches finish
                while (positions[chosenWinner] < trackLen) {
                    // advance horses: chosen winner gets slightly larger steps
                    for (const h of horses) {
                        const step = (h === chosenWinner) ? (Math.floor(Math.random() * 2) + 1) : Math.floor(Math.random() * 2);
                        positions[h] = Math.min(trackLen, positions[h] + step);
                    }

                    // Build track display
                                // Build track display
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
                        await interaction.editReply({ embeds: [raceEmbed], components: [] });
                    } catch (e) {
                        // fallback if interaction is no longer valid
                        try {
                            await gameMessage.edit({ embeds: [raceEmbed], components: [] });
                        } catch (e2) {
                            // ignore edit errors (rate limits) and continue
                        }
                    }

                    await sleep(700);
                }

                // Final winner is chosenWinner
                const winner = chosenWinner;

                // Calculate payout first (odds bonus based on horse chance)
                let payout = 0;
                if (choice === winner) {
                    const oddsBonus = oddsMultipliers[choice] || 1.0;
                    payout = Math.floor(bet * payoutMultiplier * oddsBonus); // payout per course with odds
                    await economyManager.addMoney(message.guild.id, message.author.id, payout);
                }

                // Save the record FIRST before getting stats
                try {
                    await horseRaceManager.addRecord({
                        guildId: message.guild.id,
                        userId: message.author.id,
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

                // NOW get updated horse stats (after saving the record)
                const horseStats = await horseRaceManager.getHorseStats(message.guild.id, course);

                // Build horse stats text
                let statsText = '**Horse Records** (W-L):\n';
                for (let h = 1; h <= 5; h++) {
                    const w = horseStats[h].wins;
                    const l = horseStats[h].losses;
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
                            { name: 'New Balance', value: `💰 ${economyManager.getUserData(message.guild.id, message.author.id).balance} coins`, inline: false },
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
                            { name: 'New Balance', value: `💰 ${economyManager.getUserData(message.guild.id, message.author.id).balance} coins`, inline: false },
                            { name: 'Stats (This Course)', value: statsText, inline: false }
                        );
                }

                try {
                    await interaction.editReply({ embeds: [resultEmbed], components: [] });
                } catch (e) {
                    try {
                        await gameMessage.edit({ embeds: [resultEmbed], components: [] });
                    } catch (e2) {
                        // ignore edit errors
                    }
                }
                collector.stop();
            });

            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    message.reply('❌ You didn\'t pick a horse in time! Your bet has been forfeited.');
                }
            });

        } catch (error) {
            console.error('Error in horserace command:', error);
            message.reply('❌ An error occurred while starting the horse race!');
        }
    }
};
