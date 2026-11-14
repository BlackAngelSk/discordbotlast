// @ts-check
/**
 * Community panel — tickets and suggestions at a glance.
 *
 * Read-only summary (the web page's lists): open/closed ticket counts, recent
 * tickets, suggestion counts by status. Editing lives in the `tickets` and
 * `suggestions` settings categories, linked from the panel.
 *
 * CustomIds: `community:*:{token}`.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const ticketManager = require('../automation/ticketManager');
const suggestionManager = require('../automation/suggestionManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;

/**
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildEmbed(guild) {
  const guildId = String(guild.id);

  const tickets = Object.values(ticketManager.getGuildTickets(guildId) || {});
  const openTickets = tickets.filter((ticket) => ticket && ticket.status !== 'closed').length;
  const recentTickets = tickets
    .slice(-3)
    .map((ticket) => `• <#${ticket.channelId || '?'}> — ${ticket.status || 'open'}`)
    .join('\n');

  const suggestions = suggestionManager.getGuildSuggestions(guildId) || [];
  const pending = suggestions.filter((s) => (s.status || 'pending') === 'pending').length;
  const approved = suggestions.filter((s) => s.status === 'approved').length;
  const topSuggestions = suggestions
    .slice()
    .sort((a, b) => Number(b.upvotes || 0) - Number(a.votes || a.upvotes || 0))
    .slice(0, 3)
    .map((s) => `• #${s.id} ${String(s.content || '').slice(0, 60)} — 👍 ${Number(s.upvotes || 0)}`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: 'Community', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('🎫 Community')
    .addFields(
      { name: '🎟️ Open tickets', value: String(openTickets), inline: true },
      { name: '📨 Suggestions', value: `${pending} pending · ${approved} approved`, inline: true },
      { name: '🗂️ Total tickets', value: String(tickets.length), inline: true },
      { name: '🕒 Recent tickets', value: recentTickets || '*No tickets yet.*', inline: false },
      {
        name: '💡 Top suggestions',
        value: topSuggestions || '*No suggestions yet.*',
        inline: false,
      }
    )
    .setFooter({ text: 'Settings for both live in their panels' })
    .setTimestamp();
}

/**
 * @param {string} token
 * @returns {any[]}
 */
function buildRows(token) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`community:tickets:${token}`)
        .setLabel('Ticket settings')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🎟️'),
      new ButtonBuilder()
        .setCustomId(`community:suggestions:${token}`)
        .setLabel('Suggestion settings')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('💡'),
      new ButtonBuilder()
        .setCustomId(`community:refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`community:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runCommunityPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;

  await firstUpdate
    .update({ embeds: [buildEmbed(guild)], components: buildRows(token) })
    .catch(() => {});

  while (true) {
    const collected = await awaitComponentSafe(
      interaction,
      (/** @type {any} */ i) => String(i.customId).startsWith('community:') && i.user.id === userId,
      TIMEOUT
    );
    if (!collected) return 'timeout';

    const id = String(collected.customId);
    if (id === `community:back:${token}`) return 'back';

    if (id === `community:refresh:${token}`) {
      await collected
        .update({ embeds: [buildEmbed(guild)], components: buildRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `community:tickets:${token}` || id === `community:suggestions:${token}`) {
      const category = id.startsWith('community:tickets:') ? 'tickets' : 'suggestions';
      const { embed, components } = engine.renderCategory(guild, category, token);
      await collected.update({ embeds: [embed], components }).catch(() => {});
      await engine.categoryLoop(interaction, category, token, { skipBackRender: true });
      await interaction
        .editReply({ embeds: [buildEmbed(guild)], components: buildRows(token) })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = { buildEmbed, buildRows, runCommunityPanel };
