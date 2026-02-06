const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    name: 'spouse',
    description: 'View your spouse or check someone\'s spouse!',
    usage: '!spouse [@user]',
    aliases: ['partner', 'married', 'husband', 'wife'],
    category: 'fun',
    async execute(message, args) {
        try {
            const user = message.mentions.users.first() || message.author;
            const marriage = relationshipManager.getMarriage(message.guild.id, user.id);

            if (!marriage) {
                return message.reply(`❌ ${user.id === message.author.id ? 'You are' : 'This user is'} not married!`);
            }

            const spouse = await message.client.users.fetch(marriage.spouse);
            const daysMarried = Math.floor((Date.now() - marriage.marriedAt) / (1000 * 60 * 60 * 24));
            const yearsMarried = Math.floor(daysMarried / 365);

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle(`💍 ${user.username}'s Spouse`)
                .setThumbnail(spouse.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Partner', value: spouse.username, inline: true },
                    { name: 'Married Since', value: new Date(marriage.marriedAt).toLocaleDateString(), inline: true },
                    { name: 'Days Married', value: `${daysMarried} days`, inline: true },
                    { name: 'Years Married', value: `${yearsMarried} year(s)`, inline: true }
                )
                .setFooter({ text: '💕 A perfect match!' })
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in spouse command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
