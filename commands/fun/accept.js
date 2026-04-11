const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');
const achievementManager = require('../../utils/achievementManager');

module.exports = {
    name: 'accept',
    description: 'Accept a marriage proposal!',
    usage: '!accept @user',
    aliases: [],
    category: 'fun',
    async execute(message, args) {
        try {
            const user = message.mentions.users.first();

            if (!user) {
                // Get pending proposals
                const proposals = relationshipManager.getPendingProposals(message.guild.id, message.author.id);

                if (proposals.length === 0) {
                    return message.reply('❌ You have no pending proposals!');
                }

                if (proposals.length === 1) {
                    const proposer = await message.client.users.fetch(proposals[0].proposerId);
                    const result = await relationshipManager.acceptProposal(message.guild.id, message.author.id, proposals[0].proposerId);

                    if (result.success) {
                        await Promise.all([
                            achievementManager.syncUser(message.guild.id, message.author.id),
                            achievementManager.syncUser(message.guild.id, proposals[0].proposerId)
                        ]);

                        const embed = new EmbedBuilder()
                            .setColor(0xff69b4)
                            .setTitle('💍 Wedding!')
                            .setDescription(`${message.author} and ${proposer} are now married! 💕`)
                            .setFooter({ text: 'Congratulations!' })
                            .setTimestamp();

                        return message.reply({ embeds: [embed] });
                    }
                } else {
                    return message.reply(`❌ You have multiple proposals! Please mention who you want to accept: \`!accept @user\``);
                }
            } else {
                const result = await relationshipManager.acceptProposal(message.guild.id, message.author.id, user.id);

                if (!result.success) {
                    return message.reply('❌ There is no proposal from this user!');
                }

                await Promise.all([
                    achievementManager.syncUser(message.guild.id, message.author.id),
                    achievementManager.syncUser(message.guild.id, user.id)
                ]);

                const embed = new EmbedBuilder()
                    .setColor(0xff69b4)
                    .setTitle('💍 Wedding!')
                    .setDescription(`${message.author} and ${user} are now married! 💕`)
                    .setFooter({ text: 'Congratulations!' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in accept command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
