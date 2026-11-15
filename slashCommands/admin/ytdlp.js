const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const ytdlpUpdater = require('../../utils/music/ytdlpUpdater');

const STATUS_LABELS = {
  updated: '✅ Updated',
  'up-to-date': '✅ Up to date',
  'package-manager': 'ℹ️ Managed by the system package manager',
  failed: '❌ Failed',
};

function formatTimestamp(value) {
  if (!value) return 'never';
  const unix = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(unix) ? `<t:${unix}:R>` : 'never';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ytdlp')
    .setDescription('Check or force-update the yt-dlp binary (Bot Owner Only)')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Show yt-dlp version and update state')
    )
    .addSubcommand((sub) => sub.setName('update').setDescription('Run yt-dlp -U right now')),

  // /testcommands must not spawn `yt-dlp -U` during the simulation.
  skipInSimulation: true,
  simulationSkipReason: 'spawns yt-dlp -U',

  async execute(interaction) {
    const ownerId = process.env.BOT_OWNER_ID;

    if (!ownerId) {
      return interaction.reply({
        content: '❌ BOT_OWNER_ID is not configured.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: '❌ This command is only available to the bot owner.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === 'update') {
      const result = await ytdlpUpdater.update({ reason: `slash:${interaction.user.id}` });
      const label = STATUS_LABELS[result.status] || result.status;

      const embed = new EmbedBuilder()
        .setColor(result.status === 'failed' ? 0xed4245 : 0x57f287)
        .setTitle('🎬 yt-dlp update')
        .addFields(
          { name: 'Result', value: label, inline: true },
          {
            name: 'Version',
            value: result.previousVersion
              ? `${result.previousVersion} → ${result.version || 'unknown'}`
              : result.version || 'unknown',
            inline: true,
          },
          { name: 'Binary', value: `\`${result.binary || 'not found'}\``, inline: false }
        )
        .setTimestamp();

      if (result.detail) embed.setDescription(result.detail);

      return interaction.editReply({ embeds: [embed] });
    }

    const status = ytdlpUpdater.getStatus();
    const last = status.lastResult;

    const embed = new EmbedBuilder()
      .setColor(status.enabled ? 0x5865f2 : 0xfee75c)
      .setTitle('🎬 yt-dlp status')
      .addFields(
        {
          name: 'Auto-update',
          value: status.enabled ? `Every ${status.intervalHours}h` : 'Disabled',
          inline: true,
        },
        { name: 'Version', value: status.version || 'unknown', inline: true },
        { name: 'Binary', value: `\`${status.binary || 'not found'}\``, inline: false },
        { name: 'Last check', value: formatTimestamp(status.lastRunAt), inline: true },
        {
          name: 'Last result',
          value: last
            ? `${STATUS_LABELS[last.status] || last.status} — ${last.detail}`
            : 'not run yet',
          inline: false,
        }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
