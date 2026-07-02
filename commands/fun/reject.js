const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
  name: 'reject',
  description: 'Reject a marriage proposal!',
  usage: '!reject @user',
  aliases: ['decline'],
  category: 'fun',
  async execute(message, args) {
    try {
      const user = message.mentions.users.first();

      if (!user) {
        // Get pending proposals
        const proposals = relationshipManager.getPendingProposals(
          message.guild.id,
          message.author.id
        );

        if (proposals.length === 0) {
          return message.reply('❌ You have no pending proposals!');
        }

        if (proposals.length === 1) {
          const proposer = await message.client.users.fetch(proposals[0].proposerId);
          await relationshipManager.rejectProposal(
            message.guild.id,
            message.author.id,
            proposals[0].proposerId
          );

          const embed = new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle('💔 Proposal Rejected')
            .setDescription(`${message.author} rejected ${proposer}'s proposal!`)
            .setFooter({ text: 'Better luck next time!' })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
        return message.reply(
          `❌ You have multiple proposals! Please mention who you want to reject: \`!reject @user\``
        );
      }
      const result = await relationshipManager.rejectProposal(
        message.guild.id,
        message.author.id,
        user.id
      );

      if (!result.success) {
        return message.reply('❌ There is no proposal from this user!');
      }

      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('💔 Proposal Rejected')
        .setDescription(`${message.author} rejected ${user}'s proposal!`)
        .setFooter({ text: 'Better luck next time!' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in reject command:', error);
      message.reply('❌ An error occurred!');
    }
  },
};
