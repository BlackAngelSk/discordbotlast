const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

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
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${userData.balance} coins`, ephemeral: true });
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, bet);

            // Play the game with betting
            await playBlackjackWithBet(interaction, bet);

        } catch (error) {
            console.error('Error in blackjack command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while playing blackjack!', ephemeral: true });
            }
        }
    }
};

async function playBlackjackWithBet(interaction, bet) {
    const deck = [];
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ rank, suit });
        }
    }
    
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    };
    
    shuffle(deck);
    
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
        
        await interaction.reply({ embeds: [instantResult] });
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
        
        await interaction.reply({ embeds: [instantWin] });
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
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            { name: `${interaction.user.username}'s Hand (${handValue(playerHand)})`, value: formatHand(playerHand) },
            { name: 'Dealer Hand', value: formatHand(dealerHand, true) },
            { name: '💰 Bet', value: `${bet} coins`, inline: true }
        )
        .setDescription('Hit or Stand?')
        .setFooter({ text: `Payout: Win = ${bet * 2} coins | Tie = ${bet} coins` });
    
    const msg = await interaction.reply({ embeds: [prompt], components: [createButtons()], fetchReply: true });
    
    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id
    });
    
    collector.on('collect', async i => {
        if (i.customId === 'bj_hit') {
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
                        { name: '💰 Loss', value: `${bet} coins`, inline: true }
                    )
                    .setDescription('💥 You busted! Dealer wins.')
                    .setFooter({ text: `Bet: ${bet} coins` });
                
                await i.update({ embeds: [bust], components: [createButtons(true)] });
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
                    { name: '💰 Bet', value: `${bet} coins`, inline: true }
                )
                .setDescription('Hit or Stand?')
                .setFooter({ text: `Payout: Win = ${bet * 2} coins | Tie = ${bet} coins` });
            
            await i.update({ embeds: [updated], components: [createButtons()] });
            
        } else if (i.customId === 'bj_stand') {
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
                .setFooter({ text: `Bet: ${bet} coins` });
            
            await i.update({ embeds: [final], components: [createButtons(true)] });
            collector.stop('finished');
        }
    });
    
    collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
            await msg.edit({ content: '⏰ Game timed out.', components: [createButtons(true)] });
        }
    });
}
