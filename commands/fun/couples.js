const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    name: 'couples',
    description: 'View the top married couples in the server!',
    usage: '!couples',
    aliases: ['marriages', 'lovers'],
    category: 'fun',
    async execute(message, args) {
        try {
            const leaderboard = relationshipManager.getMarriageLeaderboard(message.guild.id, 10);

            if (leaderboard.length === 0) {
                return message.reply('❌ No married couples in this server yet!');
            }

            let description = '';
            for (let i = 0; i < leaderboard.length; i++) {
                const couple = leaderboard[i];
                let user1, user2;

                try {
                    user1 = await message.client.users.fetch(couple.partner1);
                    user2 = await message.client.users.fetch(couple.partner2);
                } catch (e) {
                    continue;
                }

                const yearsMarried = Math.floor(couple.daysMarried / 365);
                description += `**${i + 1}.** ${user1.username} ❤️ ${user2.username}\n`;
                description += `   📅 ${couple.daysMarried} days (${yearsMarried} year${yearsMarried !== 1 ? 's' : ''})\n\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💍 Longest Marriages in the Server')
                .setDescription(description)
                .setFooter({ text: 'Love is in the air! 💕' })
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in couples command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
