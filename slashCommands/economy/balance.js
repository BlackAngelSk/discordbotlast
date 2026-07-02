const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription("Check your or someone else's balance")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to check balance').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const userData = economyManager.getUserData(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`💰 ${target.username}'s Balance`)
      .addFields(
        { name: 'Balance', value: `💵 ${formatNumber(userData.balance)} coins`, inline: true },
        { name: 'Level', value: `⭐ ${userData.level}`, inline: true },
        { name: 'XP', value: `✨ ${formatNumber(userData.xp)}`, inline: true }
      )
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
