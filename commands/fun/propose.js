const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    name: 'propose',
    description: 'Propose marriage to someone!',
    usage: '!propose @user',
    aliases: ['marry'],
    category: 'fun',
    async execute(message, args) {
        try {
            const user = message.mentions.users.first();

            if (!user) {
                return message.reply('❌ Please mention a user to propose to! `!propose @user`');
            }

            if (user.id === message.author.id) {
                return message.reply('❌ You cannot propose to yourself!');
            }

            if (user.bot) {
                return message.reply('❌ You cannot propose to a bot!');
            }

            const proposal = await relationshipManager.propose(message.guild.id, message.author.id, user.id);

            if (!proposal.success) {
                if (proposal.reason === 'oneAlreadyMarried') {
                    return message.reply('❌ One of you is already married!');
                } else if (proposal.reason === 'proposalExists') {
                    return message.reply('❌ There is already a pending proposal between you two!');
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💍 Marriage Proposal!')
                .setDescription(`${message.author} is asking ${user} to marry them! 💕`)
                .addFields(
                    { name: 'Accept', value: 'React with ✅ or use `!accept`', inline: false },
                    { name: 'Reject', value: 'React with ❌ or use `!reject`', inline: false },
                    { name: 'Expires in', value: '24 hours', inline: false }
                )
                .setImage(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'React quickly to respond to this proposal!' })
                .setTimestamp();

            const sentMessage = await message.reply({ embeds: [embed] });
            await sentMessage.react('✅');
            await sentMessage.react('❌');

        } catch (error) {
            console.error('Error in propose command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
