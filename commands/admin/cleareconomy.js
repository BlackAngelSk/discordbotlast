const { EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
  name: 'cleareconomy',
  description: 'Clear all economy and gambling leaderboard data (Admin only)',
  usage: '!cleareconomy',
  aliases: ['cleareco', 'resetall'],
  category: 'admin',
  async execute(message, args) {
    try {
      // Check permissions
      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You need "Administrator" permission!');
      }

      // Confirm action
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⚠️ Clear All Economy & Gambling Data')
        .setDescription(
          'This will permanently delete:\n\n• All user balances and coins\n• All XP and levels\n• All inventories\n• All gambling statistics (Blackjack, Roulette, Slots, Dice, Coinflip, RPS, TTT)\n• All leaderboard data\n\n**This action CANNOT be undone!**'
        )
        .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel' })
        .setTimestamp();

      const confirmMessage = await message.reply({ embeds: [confirmEmbed] });

      // Add reactions for confirmation
      await confirmMessage.react('✅');
      await confirmMessage.react('❌');

      // Wait for reaction
      const filter = (reaction, user) =>
        (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
        user.id === message.author.id;

      const collected = await confirmMessage.awaitReactions({ filter, max: 1, time: 30000 });

      if (collected.size === 0) {
        return confirmMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('❌ Cancelled')
              .setDescription('The clear operation was cancelled.'),
          ],
          components: [],
        });
      }

      const reaction = collected.first();

      if (reaction.emoji.name === '❌') {
        return confirmMessage.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('❌ Cancelled')
              .setDescription('The clear operation was cancelled.'),
          ],
          components: [],
        });
      }

      // Clear economy data
      const economyCount = Object.keys(economyManager.data.users).length;
      economyManager.data.users = {};
      economyManager.data.shops = {};
      await economyManager.save();

      // Clear gambling leaderboards
      const gamblingCount = gameStatsManager.stats.size;
      gameStatsManager.stats.clear();
      await gameStatsManager.save();

      // Success embed
      const successEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Data Cleared Successfully')
        .setDescription(`All data has been permanently deleted!`)
        .addFields(
          { name: '💰 Economy Records', value: `${economyCount} user(s) cleared`, inline: true },
          {
            name: '🎰 Gambling Leaderboards',
            value: `${gamblingCount} user(s) cleared`,
            inline: true,
          },
          { name: 'Total', value: `${economyCount + gamblingCount} user(s) affected`, inline: true }
        )
        .setFooter({ text: `Cleared by ${message.author.username}` })
        .setTimestamp();

      return confirmMessage.edit({ embeds: [successEmbed], components: [] });
    } catch (error) {
      console.error('Error in cleareconomy command:', error);
      message.reply('❌ An error occurred while clearing data!');
    }
  },
};
