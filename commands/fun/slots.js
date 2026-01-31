const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    name: 'slots',
    description: 'Play slots and bet your coins!',
    usage: '!slots <bet>',
    aliases: ['slot', 'slotmachine'],
    category: 'fun',
    async execute(message, args) {
        try {
            const bet = parseInt(args[0]);

            if (!bet || bet < 10) {
                return message.reply('❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!slots <bet>`');
            }

            // Check if user has enough money
            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < bet) {
                return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
            }

            // Deduct bet from user balance
            await economyManager.removeMoney(message.guild.id, message.author.id, bet);

            // Play the game with betting
            await playSlotsWithBet(message, bet);

        } catch (error) {
            console.error('Error in slots command:', error);
            message.reply('❌ An error occurred while playing slots!');
        }
    }
};

async function playSlotsWithBet(message, bet) {
    const slotSymbols = ['🍎', '🍊', '🍋', '🍌', '🍇', '⭐', '💎', '🔔'];
    
    const spinSlots = () => {
        return [
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)]
        ];
    };

    const calculatePayout = (symbols) => {
        const [slot1, slot2, slot3] = symbols;
        
        // Check for three of a kind
        if (slot1 === slot2 && slot2 === slot3) {
            if (slot1 === '💎') return bet * 10; // Jackpot!
            if (slot1 === '⭐') return bet * 5;
            return bet * 2;
        }
        
        // Check for two of a kind
        if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            return bet;
        }
        
        return 0;
    };

    const spinEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎰 Slots Machine')
        .setDescription(`Spinning the reels... (Bet: ${bet} coins)\n\n🎰 | 🎰 | 🎰`);

    const msg = await message.reply({ embeds: [spinEmbed] });

    // Simulate spinning
    await new Promise(resolve => setTimeout(resolve, 1500));

    const result = spinSlots();
    const payout = calculatePayout(result);
    const won = payout > 0;

    if (won) {
        await economyManager.addMoney(message.guild.id, message.author.id, payout);
    }

    await gameStatsManager.recordSlots(message.author.id, won);

    let resultDescription = `**${result[0]} | ${result[1]} | ${result[2]}**\n\n`;
    
    if (payout === bet * 10) {
        resultDescription += '🎉 **JACKPOT!!!** You got three 💎s!';
    } else if (payout === bet * 5) {
        resultDescription += '🌟 **EXCELLENT!** You got three ⭐s!';
    } else if (payout === bet * 2) {
        resultDescription += '✨ **Great!** You got three matching symbols!';
    } else if (payout === bet) {
        resultDescription += '👍 **Nice!** You got two matching symbols!';
    } else {
        resultDescription += '😢 No matches. Better luck next time!';
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle('🎰 Slots Machine - Result')
        .setDescription(resultDescription)
        .addFields(
            { name: 'Bet', value: `${bet} coins`, inline: true },
            { name: 'Result', value: won ? `✅ Won ${payout} coins!` : '❌ Lost', inline: true }
        );

    await msg.edit({ embeds: [resultEmbed] });
}
