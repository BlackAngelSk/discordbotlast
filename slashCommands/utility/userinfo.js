const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('User to get information about (defaults to you)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: '❌ User not found in this server!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const roles = member.roles.cache
      .filter((role) => role.id !== interaction.guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => role.toString())
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(member.displayHexColor || '#0099FF')
      .setTitle(`User Information: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '👤 Username', value: target.username, inline: true },
        { name: '🆔 ID', value: target.id, inline: true },
        { name: '🤖 Bot', value: target.bot ? 'Yes' : 'No', inline: true },
        {
          name: '📅 Account Created',
          value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: '📥 Joined Server',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
          inline: true,
        },
        { name: '🎨 Highest Role', value: member.roles.highest.toString(), inline: true },
        { name: `🎭 Roles [${roles.length}]`, value: roles.length > 0 ? roles.join(', ') : 'None' }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
