const { EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
  name: 'divorce',
  description: 'End your marriage!',
  usage: '!divorce',
  aliases: ['breakup'],
  category: 'fun',
  async execute(message, args) {
    try {
      const marriage = relationshipManager.getMarriage(message.guild.id, message.author.id);

      if (!marriage) {
        return message.reply('❌ You are not married!');
      }

      // Confirmation step
      const confirmMessage = await message.reply(
        '⚠️ Are you sure you want to divorce? React with ✅ to confirm or ❌ to cancel.'
      );
      await confirmMessage.react('✅');
      await confirmMessage.react('❌');

      const filter = (reaction, user) =>
        user.id === message.author.id && ['✅', '❌'].includes(reaction.emoji.name);
      const collected = await confirmMessage
        .awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] })
        .catch(() => null);

      if (!collected || collected.first().emoji.name === '❌') {
        return confirmMessage.edit('❌ Divorce cancelled!');
      }

      const result = await relationshipManager.divorce(message.guild.id, message.author.id);

      if (result.success) {
        const spouse = await message.client.users.fetch(result.spouse).catch(() => null);
        const spouseName = spouse ? spouse.username : 'Unknown User';

        const embed = new EmbedBuilder()
          .setColor(0xff6b6b)
          .setTitle('💔 Divorce')
          .setDescription(`${message.author} has divorced ${spouseName}!`)
          .setFooter({ text: 'It was not meant to be...' })
          .setTimestamp();

        return confirmMessage.edit({ content: '', embeds: [embed] });
      }
      return confirmMessage.edit('❌ An error occurred while processing the divorce!');
    } catch (error) {
      console.error('Error in divorce command:', error);
      message.reply('❌ An error occurred!');
    }
  },
};
