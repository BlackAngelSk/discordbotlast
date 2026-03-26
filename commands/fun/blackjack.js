const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const { createShuffledDeck } = require('../../utils/playingCards');
const { blackjackBoardAttachment, blackjackCardAttachments, supportsBoardImageRendering } = require('../../utils/cardBoardRenderer');

module.exports = {
    name: 'blackjack',
    description: 'Play blackjack and bet your coins!',
    usage: '!blackjack <bet>',
    aliases: ['bj', '21'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0]);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!blackjack <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            // Play the game with betting
            await playBlackjackWithBet(message, bet);

        } catch (error) {
            console.error('Error in blackjack command:', error);
            message.reply('❌ An error occurred while playing blackjack!');
        }
    }
};

async function playBlackjackWithBet(message, bet) {
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

    const withBoardImage = (embed, hideDealerHole = false) => {
        const file = blackjackBoardAttachment(playerHand, dealerHand, {
            hideDealerHole,
            playerName: message.author.username,
            useAssetImages: false
        }, 'blackjack-board.png');
        
        if (file) {
            embed.setImage('attachment://blackjack-board.png');
            return { embeds: [embed], files: [file] };
        }
        
        // Fallback: attach individual cards from assets
        const files = blackjackCardAttachments(playerHand, dealerHand, { hideDealerHole });
        if (files.length > 0) {
            // Use first card as embed image if available
            const first = files[0];
            embed.setImage(`attachment://${first.name}`);
            return { embeds: [embed], files: [first] };
        }
        return { embeds: [embed] };
    };
    
    let playerHand = [deck.pop(), deck.pop()];
    let dealerHand = [deck.pop(), deck.pop()];
    
    // Check for dealer blackjack (if showing Ace or 10-value card)
    const dealerUpCard = dealerHand[0];
    const dealerShowsAceOr10 = dealerUpCard.rank === 'A' || ['10', 'J', 'Q', 'K'].includes(dealerUpCard.rank);
    const dealerHasBlackjack = handValue(dealerHand) === 21;
    const playerHasBlackjack = handValue(playerHand) === 21;
    
    // If dealer shows Ace/10 and has blackjack, reveal immediately
    if (dealerShowsAceOr10 && dealerHasBlackjack) {
        const playerVal = handValue(playerHand);
        let outcome;
        let color;
        let payout = 0;
        
        if (playerHasBlackjack) {
            outcome = "🤝 Both blackjack! It's a push (tie)!";
            color = 0xf1c40f;
            payout = bet;
            await gameStatsManager.recordBlackjack(message.author.id, 'tie');
        } else {
            outcome = '🃏 Dealer has Blackjack! Dealer wins.';
            color = 0xed4245;
            payout = 0;
            await gameStatsManager.recordBlackjack(message.author.id, 'loss');
        }
        
        if (payout > 0) {
            await economyManager.addMoney(message.guild.id, message.author.id, payout);
        }
        
        const instantResult = new EmbedBuilder()
            .setColor(color)
            .setTitle('🃏 Blackjack - Dealer Blackjack!')
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                { name: `Dealer Hand (21)`, value: formatHand(dealerHand) },
                { name: '💰 Payout', value: `${payout} coins`, inline: true }
            )
            .setDescription(outcome)
            .setFooter({ text: `Bet: ${bet} coins` });
        
        await message.reply(withBoardImage(instantResult, false));
        return;
    }
    
    // If player has blackjack but dealer doesn't
    if (playerHasBlackjack) {
        const payout = Math.floor(bet * 2.5);
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
        await gameStatsManager.recordBlackjack(message.author.id, 'win');
        
        const instantWin = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🃏 Blackjack!')
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: `${message.author.username}'s Hand (21)`, value: formatHand(playerHand) },
                { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) },
                { name: '💰 Payout', value: `${payout} coins (2.5x)`, inline: true }
            )
            .setDescription('🎉 Blackjack! You win!')
            .setFooter({ text: `Bet: ${bet} coins` });
        
        await message.reply(withBoardImage(instantWin, false));
        return;
    }
    
    const createButtons = (disabled = false) => {
        return new ActionRowBuilder().addComponents(
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
        );
    };
    
    const prompt = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🃏 Blackjack')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: `${message.author.username}'s Hand (${handValue(playerHand)})`, value: formatHand(playerHand) },
            { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
            { name: '💰 Bet', value: `${bet} coins`, inline: true }
        )
        .setDescription('Hit or Stand?')
        .setFooter({ text: `Payout: Win = ${bet * 2} coins | Tie = ${bet} coins` });
    
    const msg = await message.reply({ ...withBoardImage(prompt, true), components: [createButtons()] });
    
    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: interaction => interaction.user.id === message.author.id
    });
    
    collector.on('collect', async interaction => {
        if (interaction.customId === 'bj_hit') {
            playerHand.push(deck.pop());
            const playerVal = handValue(playerHand);
            
            if (playerVal > 21) {
                await gameStatsManager.recordBlackjack(message.author.id, 'loss');
                
                const bust = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('🃏 Blackjack - Bust!')
                    .setThumbnail(message.author.displayAvatarURL())
                    .addFields(
                        { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                        { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) },
                        { name: '💰 Loss', value: `${bet} coins`, inline: true }
                    )
                    .setDescription('💥 You busted! Dealer wins.')
                    .setFooter({ text: `Bet: ${bet} coins` });
                
                await interaction.update({ ...withBoardImage(bust, false), components: [createButtons(true)] });
                collector.stop('bust');
                return;
            }
            
            const updated = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🃏 Blackjack')
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                    { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
                    { name: '💰 Bet', value: `${bet} coins`, inline: true }
                )
                .setDescription('Hit or Stand?')
                .setFooter({ text: `Payout: Win = ${bet * 2} coins | Tie = ${bet} coins` });
            
            await interaction.update({ ...withBoardImage(updated, true), components: [createButtons()] });
            
        } else if (interaction.customId === 'bj_stand') {
            // Dealer reveals hole card and plays according to rules
            while (handValue(dealerHand) <= 16) {
                dealerHand.push(deck.pop());
            }
            
            const playerVal = handValue(playerHand);
            const dealerVal = handValue(dealerHand);
            
            let outcome;
            let color;
            let result;
            let payout;
            
            if (dealerVal > 21) {
                outcome = '💥 Dealer busted! You win!';
                color = 0x57f287;
                result = 'win';
                payout = bet * 2;
            } else if (playerVal > dealerVal) {
                outcome = '🎉 You win!';
                color = 0x57f287;
                result = 'win';
                payout = bet * 2;
            } else if (playerVal < dealerVal) {
                outcome = '😅 Dealer wins.';
                color = 0xed4245;
                result = 'loss';
                payout = 0;
            } else {
                outcome = "🤝 It's a push (tie)!";
                color = 0xf1c40f;
                result = 'tie';
                payout = bet;
            }
            
            await gameStatsManager.recordBlackjack(message.author.id, result);
            if (payout > 0) {
                await economyManager.addMoney(message.guild.id, message.author.id, payout);
            }
            
            const final = new EmbedBuilder()
                .setColor(color)
                .setTitle('🃏 Blackjack - Final')
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
                    { name: `Dealer Hand (${dealerVal})`, value: formatHand(dealerHand) },
                    { name: '💰 Payout', value: `${payout} coins`, inline: true }
                )
                .setDescription(outcome)
                .setFooter({ text: `Bet: ${bet} coins` });
            
            await interaction.update({ ...withBoardImage(final, false), components: [createButtons(true)] });
            collector.stop('finished');
        }
    });
    
    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await msg.edit({ content: '⏰ Game timed out.', components: [createButtons(true)] });
        }
    });
}
