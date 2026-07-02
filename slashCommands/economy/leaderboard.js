const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View server leaderboard')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(false)
        .addChoices(
          { name: 'Balance', value: 'balance' },
          { name: 'Level', value: 'level' },
          { name: 'XP', value: 'xp' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'balance';
    const leaderboard = economyManager.getLeaderboard(interaction.guildId, type, 10);

    if (leaderboard.length === 0) {
      return interaction.reply({
        content: '❌ No leaderboard data available!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const typeEmojis = { balance: '💰', level: '⭐', xp: '✨' };
    const typeNames = { balance: 'Balance', level: 'Level', xp: 'XP' };

    const leaderboardText = await Promise.all(
      leaderboard.map(async (user, index) => {
        try {
          const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
          const username = member ? member.user.username : 'Unknown User';
          return `${emojis[index]} **${username}** - ${typeEmojis[type]} ${formatNumber(user[type])}`;
        } catch {
          return `${emojis[index]} **Unknown User** - ${typeEmojis[type]} ${formatNumber(user[type])}`;
        }
      })
    );

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`🏆 ${typeNames[type]} Leaderboard`)
      .setDescription(leaderboardText.join('\n'))
      .setFooter({ text: `${interaction.guild.name} Leaderboard` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
