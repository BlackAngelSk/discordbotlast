const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    name: 'weekly',
    description: 'Claim your weekly coin reward',
    usage: '!weekly',
    aliases: ['weeklyreward'],
    category: 'economy',
    async execute(message, args, client) {
        try {
            const result = await economyManager.claimWeekly(message.guild.id, message.author.id);

            if (!result.success) {
                const days = Math.floor(result.timeLeft / (1000 * 60 * 60 * 24));
                const hours = Math.floor((result.timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                return message.reply(`⏰ You already claimed your weekly reward! Come back in **${days}d ${hours}h**.`);
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎁 Weekly Reward Claimed!')
                .setDescription(`You received **${result.amount.toLocaleString()} coins**!`)
                .setFooter({ text: 'Come back next week for more!' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in weekly command:', error);
            message.reply('❌ An error occurred while claiming your weekly reward.');
        }
    }
};
