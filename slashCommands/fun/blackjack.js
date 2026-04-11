const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const { createShuffledDeck } = require('../../utils/playingCards');
const { blackjackBoardAttachment } = require('../../utils/cardBoardRenderer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack and bet your coins!')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10 coins)')
                .setRequired(true)
                .setMinValue(10)),
    
    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');

            // Check if user has enough money
            const userData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userData.balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, flags: MessageFlags.Ephemeral });
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);

            // Play the game with betting
            await playBlackjackWithBet(interaction, bet);

        } catch (error) {
            console.error('Error in blackjack command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing blackjack!', flags: MessageFlags.Ephemeral });
            }
        }
    }
};

async function playBlackjackWithBet(interaction, bet) {
    const deck = createShuffledDeck();
    
    const cardValue = (card) => {
        if (card.rank === 'A') return 11;
        if (['J', 'Q', 'K'].includes(card.rank)) return 10;
        return parseInt(card.rank);
    };
    
    const handValue = (hand) => {
        let value = hand.reduce((sum, card) => sum + cardValue(card), 0);
        let aces = hand.filter(c => c.rank === 'A').length;
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        return value;
    };
    
    const formatHand = (hand, hide = false) => {
        if (hide) {
            return `${hand[0].rank}${hand[0].suit} 🂠`;
        }
        return hand.map(c => `${c.rank}${c.suit}`).join(' ');
    };

    const withBoardImage = (embed, hideDealerHole = false, activeHand = null) => {
        const displayHand = activeHand || playerHand;
        const file = blackjackBoardAttachment(displayHand, dealerHand, {
            hideDealerHole,
            playerName: interaction.user.username,
            useAssetImages: true
        }, 'blackjack-board.png');
        
        if (file) {
            embed.setImage('attachment://blackjack-board.png');
            return { embeds: [embed], files: [file] };
        }

        const vectorBoard = blackjackBoardAttachment(displayHand, dealerHand, {
            hideDealerHole,
            playerName: interaction.user.username,
            useAssetImages: false
        }, 'blackjack-board.png');

        if (vectorBoard) {
            embed.setImage('attachment://blackjack-board.png');
            return { embeds: [embed], files: [vectorBoard] };
        }

        return { embeds: [embed] };
    };
    
    let playerHand = [deck.pop(), deck.pop()];
    let dealerHand = [deck.pop(), deck.pop()];
    
    const dealerUpCard = dealerHand[0];
    const dealerShowsAceOr10 = dealerUpCard.rank === 'A' || ['10', 'J', 'Q', 'K'].includes(dealerUpCard.rank);
    const dealerHasBlackjack = handValue(dealerHand) === 21;
    const playerHasBlackjack = handValue(playerHand) === 21;
    
    if (dealerShowsAceOr10 && dealerHasBlackjack) {
        const playerVal = handValue(playerHand);
        let outcome, color, payout = 0;
        
        if (playerHasBlackjack) {
            outcome = "🤝 Both blackjack! It's a push (tie)!";
            color = 0xf1c40f;
            payout = bet;
            await gameStatsManager.recordBlackjack(interaction.user.id, 'tie');
        } else {
            outcome = '🃏 Dealer has Blackjack! Dealer wins.';
            color = 0xed4245;
            await gameStatsManager.recordBlackjack(interaction.user.id, 'loss');
        }
        
        if (payout > 0) {
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        }
        
        const instantResult = new EmbedBuilder()
            .setColor(color)
            .setTitle('🃏 Blackjack - Dealer Blackjack!')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                { name: `Dealer Hand (21)`, value: formatHand(dealerHand) },
                { name: '💰 Payout', value: `${payout} coins`, inline: true }
            )
            .setDescription(outcome)
            .setFooter({ text: `Bet: ${bet} coins` });
        
        await interaction.reply(withBoardImage(instantResult, false));
        return;
    }
    
    if (playerHasBlackjack) {
        const payout = Math.floor(bet * 2.5);
        await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
        await gameStatsManager.recordBlackjack(interaction.user.id, 'win');
        
        const instantWin = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🃏 Blackjack!')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: `${interaction.user.username}'s Hand (21)`, value: formatHand(playerHand) },
                { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) },
                { name: '💰 Payout', value: `${payout} coins (2.5x)`, inline: true }
            )
            .setDescription('🎉 Blackjack! You win!')
            .setFooter({ text: `Bet: ${bet} coins` });
        
        await interaction.reply(withBoardImage(instantWin, false));
        return;
    }
    
    const createButtons = (disabled = false, canDouble = false, canSplit = false) => {
        const components = [
            new ButtonBuilder()
                .setCustomId('bj_hit')
                .setLabel('Hit')
                .setEmoji('🎴')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('bj_stand')
                .setLabel('Stand')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled)
        ];
        if (canDouble) components.push(
            new ButtonBuilder()
                .setCustomId('bj_double')
                .setLabel('Double Down')
                .setEmoji('💰')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        );
        if (canSplit) components.push(
            new ButtonBuilder()
                .setCustomId('bj_split')
                .setLabel('Split')
                .setEmoji('✂️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        );
        return new ActionRowBuilder().addComponents(...components);
    };

    // Check availability of double down / split on initial deal
    const userDataInit = economyManager.getUserData(interaction.guild.id, interaction.user.id);
    const initCanDouble = userDataInit.balance >= bet;
    const initCanSplit = cardValue(playerHand[0]) === cardValue(playerHand[1]) && userDataInit.balance >= bet;

    // Game state
    let isSplit = false;
    let splitHands = null;
    let splitHandIndex = 0;
    let splitBusted = [false, false];
    let currentBet = bet;

    const prompt = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🃏 Blackjack')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            { name: `${interaction.user.username}'s Hand (${handValue(playerHand)})`, value: formatHand(playerHand) },
            { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
            { name: '💰 Bet', value: `${bet} coins`, inline: true }
        )
        .setDescription('Hit or Stand?')
        .setFooter({ text: `Payout: Win = ${bet * 2} coins | Tie = ${bet} coins` });

    await interaction.reply({ ...withBoardImage(prompt, true), components: [createButtons(false, initCanDouble, initCanSplit)], withResponse: true });
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id
    });

    const showSplitHand = async (btnInteraction, handIdx) => {
        const hand = splitHands[handIdx];
        const val = handValue(hand);
        const otherIdx = handIdx === 0 ? 1 : 0;
        const otherHand = splitHands[otherIdx];
        const otherLabel = handIdx === 0
            ? 'Hand 2 (waiting)'
            : `Hand 1 (${splitBusted[0] ? '💥 Bust' : '✋ Stood'} — ${handValue(otherHand)})`;

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🃏 Blackjack — Split (Hand ${handIdx + 1})`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: `🎯 Hand ${handIdx + 1} — ${interaction.user.username} (${val})`, value: formatHand(hand) },
                { name: otherLabel, value: formatHand(otherHand) },
                { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
                { name: '💰 Bet per hand', value: `${bet} coins`, inline: true }
            )
            .setDescription(`Playing Hand ${handIdx + 1} — Hit or Stand?`)
            .setFooter({ text: `Total wagered: ${bet * 2} coins` });

        await btnInteraction.update({ ...withBoardImage(embed, true, hand), components: [createButtons()] });
    };

    const finalizeSplit = async (btnInteraction) => {
        const anyNotBusted = !splitBusted[0] || !splitBusted[1];
        if (anyNotBusted) {
            while (handValue(dealerHand) <= 16) {
                dealerHand.push(deck.pop());
            }
        }
        const dealerVal = handValue(dealerHand);

        let totalPayout = 0;
        const outcomes = [];
        let wins = 0, losses = 0;

        for (let idx = 0; idx < 2; idx++) {
            const val = handValue(splitHands[idx]);
            const label = `Hand ${idx + 1}`;
            if (splitBusted[idx]) {
                outcomes.push(`${label}: 💥 Bust — lost ${bet} coins`);
                losses++;
            } else if (dealerVal > 21 || val > dealerVal) {
                totalPayout += bet * 2;
                outcomes.push(`${label}: 🎉 Win! — +${bet} profit`);
                wins++;
            } else if (val < dealerVal) {
                outcomes.push(`${label}: 😅 Loss — lost ${bet} coins`);
                losses++;
            } else {
                totalPayout += bet;
                outcomes.push(`${label}: 🤝 Tie — ${bet} returned`);
            }
        }

        if (totalPayout > 0) {
            await economyManager.addMoney(interaction.guild.id, interaction.user.id, totalPayout);
        }
        const overallResult = wins > losses ? 'win' : losses > wins ? 'loss' : 'tie';
        await gameStatsManager.recordBlackjack(interaction.user.id, overallResult);

        const netResult = totalPayout - bet * 2;
        const color = wins > losses ? 0x57f287 : losses > wins ? 0xed4245 : 0xf1c40f;

        const final = new EmbedBuilder()
            .setColor(color)
            .setTitle('🃏 Blackjack — Split Result')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: `Hand 1 (${handValue(splitHands[0])})`, value: formatHand(splitHands[0]), inline: true },
                { name: `Hand 2 (${handValue(splitHands[1])})`, value: formatHand(splitHands[1]), inline: true },
                { name: `Dealer (${dealerVal})`, value: formatHand(dealerHand) },
                { name: '📊 Results', value: outcomes.join('\n') },
                { name: '💰 Payout', value: `${totalPayout} coins (Net: ${netResult >= 0 ? `+${netResult}` : netResult} coins)`, inline: true }
            )
            .setFooter({ text: `Total wagered: ${bet * 2} coins` });

        await btnInteraction.update({ ...withBoardImage(final, false, splitHands[0]), components: [createButtons(true)] });
    };

    collector.on('collect', async i => {
        if (i.customId === 'bj_hit') {
            if (isSplit) {
                splitHands[splitHandIndex].push(deck.pop());
                const val = handValue(splitHands[splitHandIndex]);
                if (val > 21) {
                    splitBusted[splitHandIndex] = true;
                    if (splitHandIndex === 0) {
                        splitHandIndex = 1;
                        await showSplitHand(i, 1);
                    } else {
                        await finalizeSplit(i);
                        collector.stop('finished');
                    }
                } else {
                    await showSplitHand(i, splitHandIndex);
                }
                return;
            }

            playerHand.push(deck.pop());
            const playerVal = handValue(playerHand);

            if (playerVal > 21) {
                await gameStatsManager.recordBlackjack(interaction.user.id, 'loss');

                const bust = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🃏 Blackjack - Bust!')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                        { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) },
                        { name: '💰 Loss', value: `${currentBet} coins`, inline: true }
                    )
                    .setDescription('💥 You busted! Dealer wins.')
                    .setFooter({ text: `Bet: ${currentBet} coins` });

                await i.update({ ...withBoardImage(bust, false), components: [createButtons(true)] });
                collector.stop('bust');
                return;
            }

            const updated = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🃏 Blackjack')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                    { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
                    { name: '💰 Bet', value: `${currentBet} coins`, inline: true }
                )
                .setDescription('Hit or Stand?')
                .setFooter({ text: `Payout: Win = ${currentBet * 2} coins | Tie = ${currentBet} coins` });

            await i.update({ ...withBoardImage(updated, true), components: [createButtons()] });

        } else if (i.customId === 'bj_stand') {
            if (isSplit) {
                if (splitHandIndex === 0) {
                    splitHandIndex = 1;
                    await showSplitHand(i, 1);
                } else {
                    await finalizeSplit(i);
                    collector.stop('finished');
                }
                return;
            }

            while (handValue(dealerHand) <= 16) {
                dealerHand.push(deck.pop());
            }

            const playerVal = handValue(playerHand);
            const dealerVal = handValue(dealerHand);

            let outcome, color, result, payout;

            if (dealerVal > 21) {
                outcome = '💥 Dealer busted! You win!';
                color = 0x57f287;
                result = 'win';
                payout = currentBet * 2;
            } else if (playerVal > dealerVal) {
                outcome = '🎉 You win!';
                color = 0x57f287;
                result = 'win';
                payout = currentBet * 2;
            } else if (playerVal < dealerVal) {
                outcome = '😅 Dealer wins.';
                color = 0xed4245;
                result = 'loss';
                payout = 0;
            } else {
                outcome = "🤝 It's a push (tie)!";
                color = 0xf1c40f;
                result = 'tie';
                payout = currentBet;
            }

            await gameStatsManager.recordBlackjack(interaction.user.id, result);
            if (payout > 0) {
                await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
            }

            const final = new EmbedBuilder()
                .setColor(color)
                .setTitle('🃏 Blackjack - Final')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                    { name: `Dealer Hand (${dealerVal})`, value: formatHand(dealerHand) },
                    { name: '💰 Payout', value: `${payout} coins`, inline: true }
                )
                .setDescription(outcome)
                .setFooter({ text: `Bet: ${currentBet} coins` });

            await i.update({ ...withBoardImage(final, false), components: [createButtons(true)] });
            collector.stop('finished');

        } else if (i.customId === 'bj_double') {
            const userVerify = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userVerify.balance < bet) {
                await i.reply({ content: '❌ Not enough coins to double down!', flags: MessageFlags.Ephemeral });
                return;
            }
            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);
            currentBet = bet * 2;
            playerHand.push(deck.pop());
            const playerVal = handValue(playerHand);

            if (playerVal > 21) {
                await gameStatsManager.recordBlackjack(interaction.user.id, 'loss');
                const bust = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🃏 Blackjack — Double Down Bust!')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                        { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) },
                        { name: '💰 Loss', value: `${currentBet} coins`, inline: true }
                    )
                    .setDescription('💥 Bust after double down! Dealer wins.')
                    .setFooter({ text: `Total bet: ${currentBet} coins` });
                await i.update({ ...withBoardImage(bust, false), components: [createButtons(true)] });
                collector.stop('bust');
                return;
            }

            // Auto-stand after double down
            while (handValue(dealerHand) <= 16) {
                dealerHand.push(deck.pop());
            }
            const dealerVal = handValue(dealerHand);

            let outcome, color, result, payout;
            if (dealerVal > 21 || playerVal > dealerVal) {
                outcome = dealerVal > 21 ? '💥 Dealer busted! You win!' : '🎉 You win!';
                color = 0x57f287;
                result = 'win';
                payout = currentBet * 2;
            } else if (playerVal < dealerVal) {
                outcome = '😅 Dealer wins.';
                color = 0xed4245;
                result = 'loss';
                payout = 0;
            } else {
                outcome = "🤝 It's a push (tie)!";
                color = 0xf1c40f;
                result = 'tie';
                payout = currentBet;
            }

            await gameStatsManager.recordBlackjack(interaction.user.id, result);
            if (payout > 0) {
                await economyManager.addMoney(interaction.guild.id, interaction.user.id, payout);
            }

            const final = new EmbedBuilder()
                .setColor(color)
                .setTitle('🃏 Blackjack — Double Down Result')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: `${interaction.user.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                    { name: `Dealer Hand (${dealerVal})`, value: formatHand(dealerHand) },
                    { name: '💰 Payout', value: `${payout} coins`, inline: true }
                )
                .setDescription(outcome)
                .setFooter({ text: `Total bet: ${currentBet} coins (doubled from ${bet})` });

            await i.update({ ...withBoardImage(final, false), components: [createButtons(true)] });
            collector.stop('finished');

        } else if (i.customId === 'bj_split') {
            const userVerify = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (userVerify.balance < bet) {
                await i.reply({ content: '❌ Not enough coins to split!', flags: MessageFlags.Ephemeral });
                return;
            }
            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);
            isSplit = true;
            splitHands = [
                [playerHand[0], deck.pop()],
                [playerHand[1], deck.pop()]
            ];
            splitHandIndex = 0;
            await showSplitHand(i, 0);
        }
    });

    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await msg.edit({ content: '⏰ Game timed out.', components: [createButtons(true)] });
        }
    });
}
