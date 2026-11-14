// @ts-check
/**
 * Insights panel for /dashboard — the read-only part of the old web dashboard.
 *
 * Three views: usage overview (analytics), channel/message activity (stats) and
 * bot health. Charts from the web UI become ranked text, which is what a Discord
 * embed can actually render.
 *
 * Note: analyticsManager.calculateEngagement() returns a random number, so it is
 * deliberately not shown here — the web dashboard used to display that as a real
 * "engagement score".
 *
 * CustomIds: `insights:*:{token}`.
 */

const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const analyticsManager = require('../analyticsManager');
const statsManager = require('../statsManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;
const VIEWS = ['overview', 'activity', 'health'];

/**
 * @param {number} value
 * @returns {string}
 */
function num(value) {
  return Number(value || 0).toLocaleString('en-US');
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatUptime(ms) {
  const totalMinutes = Math.floor(Number(ms || 0) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Last N days of message counts from statsManager's messagesPerDay map.
 *
 * @param {Record<string, number>} messagesPerDay
 * @param {number} [days]
 * @returns {{ date: string, count: number }[]}
 */
function recentDays(messagesPerDay, days = 7) {
  const rows = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86400000).toISOString().split('T')[0];
    rows.push({ date, count: Number(messagesPerDay?.[date] || 0) });
  }
  return rows;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {'overview' | 'activity' | 'health'} view
 * @param {any} client
 * @returns {Promise<EmbedBuilder>}
 */
async function buildEmbed(guild, view, client) {
  /** @type {any} */
  let analytics;
  try {
    analytics = await analyticsManager.getDashboardData(String(guild.id));
  } catch {
    analytics = undefined;
  }
  const stats = statsManager.getServerStats(String(guild.id));
  const overview = analytics?.overview || {};
  const topCommands = Array.isArray(analytics?.topCommands) ? analytics.topCommands : [];

  if (view === 'activity') {
    const days = recentDays(stats.messagesPerDay);
    const peak = days.reduce((max, day) => Math.max(max, day.count), 0);
    const chart = days
      .map((day) => {
        const barSize = peak > 0 ? Math.round((day.count / peak) * 10) : 0;
        return `${day.date.slice(5)}  ${'▇'.repeat(barSize) || '·'}  ${num(day.count)}`;
      })
      .join('\n');

    const channels = Object.entries(stats.channelActivity || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([id, count]) => `<#${id}> — ${num(count)}`)
      .join('\n');

    return new EmbedBuilder()
      .setColor(0x3498db)
      .setAuthor({ name: 'Insights · activity', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
      .setTitle('📈 Message activity')
      .addFields(
        { name: '💬 Tracked messages', value: num(stats.totalMessages), inline: true },
        { name: '👥 Members seen', value: num(stats.totalMembers), inline: true },
        { name: '📅 Last 7 days', value: `\`\`\`${chart}\`\`\``, inline: false },
        {
          name: '🔥 Busiest channels',
          value: channels || '*No channel activity recorded yet.*',
          inline: false,
        }
      )
      .setFooter({ text: 'Counted since the stats tracker started' })
      .setTimestamp();
  }

  if (view === 'health') {
    const uptime = Number(client?.uptime ?? process.uptime() * 1000);
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    const heap = Math.round(process.memoryUsage().heapUsed / 1048576);

    return new EmbedBuilder()
      .setColor(0x2ecc71)
      .setAuthor({ name: 'Insights · health', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
      .setTitle('🩺 Bot health')
      .addFields(
        { name: '⏱️ Uptime', value: formatUptime(uptime), inline: true },
        {
          name: '📡 Gateway',
          value: `${Math.max(0, Math.round(client?.ws?.ping || 0))} ms`,
          inline: true,
        },
        { name: '🏠 Servers', value: num(client?.guilds?.cache?.size || 0), inline: true },
        { name: '🧠 Memory', value: `${rss} MB total · ${heap} MB heap`, inline: true },
        { name: '🟢 Node', value: process.version, inline: true },
        { name: '🧩 discord.js', value: require('discord.js').version || 'unknown', inline: true }
      )
      .setFooter({ text: 'Live process values' })
      .setTimestamp();
  }

  const commandsList = topCommands.length
    ? topCommands
        .slice(0, 5)
        .map((entry, index) => `${index + 1}. \`/${entry.command}\` — ${num(entry.count)}`)
        .join('\n')
    : '*No command usage recorded yet.*';

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: 'Insights · overview', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('📊 Server insights')
    .addFields(
      { name: '💬 Messages', value: num(overview.messages ?? stats.totalMessages), inline: true },
      { name: '⌨️ Commands', value: num(overview.commands), inline: true },
      { name: '👥 Members', value: num(overview.members ?? guild.memberCount), inline: true },
      { name: '🏆 Top commands', value: commandsList, inline: false }
    )
    .setFooter({ text: 'Usage since analytics tracking started' })
    .setTimestamp();
}

/**
 * @param {'overview' | 'activity' | 'health'} current
 * @param {string} token
 * @returns {any[]}
 */
function buildRows(current, token) {
  const viewButton = (view, label, emoji) =>
    new ButtonBuilder()
      .setCustomId(`insights:${view}:${token}`)
      .setLabel(label)
      .setStyle(current === view ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(emoji)
      .setDisabled(current === view);

  return [
    new ActionRowBuilder().addComponents(
      viewButton('overview', 'Overview', '📊'),
      viewButton('activity', 'Activity', '📈'),
      viewButton('health', 'Health', '🩺'),
      new ButtonBuilder()
        .setCustomId(`insights:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runInsightsPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;
  /** @type {'overview' | 'activity' | 'health'} */
  let view = 'overview';

  await firstUpdate
    .update({
      embeds: [await buildEmbed(guild, view, interaction.client)],
      components: buildRows(view, token),
    })
    .catch(() => {});

  while (true) {
    const collected = await awaitComponentSafe(
      interaction,
      (/** @type {any} */ i) => String(i.customId).startsWith('insights:') && i.user.id === userId,
      TIMEOUT
    );
    if (!collected) return 'timeout';

    const id = String(collected.customId);
    if (id === `insights:back:${token}`) return 'back';

    const nextView = VIEWS.find((candidate) => id === `insights:${candidate}:${token}`);
    if (nextView) {
      view = /** @type {any} */ (nextView);
      await collected
        .update({
          embeds: [await buildEmbed(guild, view, interaction.client)],
          components: buildRows(view, token),
        })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  VIEWS,
  buildEmbed,
  buildRows,
  recentDays,
  formatUptime,
  runInsightsPanel,
};
