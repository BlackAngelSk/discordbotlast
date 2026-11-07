const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Adjust the music volume')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Volume level (0-100)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    const queues = interaction.client.queues;
    const queue = queues?.get?.(interaction.guild.id);

    if (!queue || !queue.connection) {
      return interaction.reply({
        content: '❌ There is no music playing!',
        flags: MessageFlags.Ephemeral,
      });
    }

    // A queue can outlive its audio resource (track ended, player destroyed).
    // Without a live resource there is nothing to change the volume on.
    const volumeController = queue.resource?.volume;
    if (!volumeController || typeof volumeController.setVolume !== 'function') {
      return interaction.reply({
        content: '❌ There is no music playing right now — start a track first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.member.voice.channel) {
      return interaction.reply({
        content: '❌ You need to be in a voice channel!',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      interaction.guild.members.me.voice.channel &&
      interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id
    ) {
      return interaction.reply({
        content: '❌ You need to be in the same voice channel!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const volume = interaction.options.getInteger('level');
    queue.volume = volume;
    volumeController.setVolume(volume / 100);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔊 Volume Changed')
      .setDescription(`Volume set to **${volume}%**`);

    await interaction.reply({ embeds: [embed] });
  },
};
