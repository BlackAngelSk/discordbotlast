/**
 * Shared giveaway embeds for the slash and prefix commands.
 *
 * Both command files used to build their own embeds, which drifted apart.
 * Keeping the visuals here means a giveaway looks identical whichever command
 * created it, and makes the layout easy to preview or unit-test.
 */
// @ts-check

const { EmbedBuilder } = require('discord.js');

const COLORS = {
  active: 0xffc93c,
  won: 0x57f287,
  empty: 0xed4245,
};

/**
 * @param {string} value
 * @param {number} max
 * @returns {string}
 */
function clip(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

/**
 * @param {number} value
 * @returns {number}
 */
function toSeconds(value) {
  const ms = Number(value);
  return Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000);
}

/**
 * @param {number} count
 * @returns {string}
 */
function plural(count, singular = 'winner', pluralForm = 'winners') {
  return count === 1 ? singular : pluralForm;
}

/**
 * The live giveaway post: prize up top, enter-instructions in the body and the
 * key facts in one inline field row.
 *
 * @param {{ prize: string, winners: number, hostId: string, endTime: number, guildIconUrl?: string | null }} input
 * @returns {EmbedBuilder}
 */
function buildGiveawayEmbed({ prize, winners, hostId, endTime, guildIconUrl = null }) {
  const winnersCount = Math.max(1, Number(winners) || 1);
  const endsAt = toSeconds(endTime);
  const safePrize = clip(prize, 200) || 'Mystery prize';

  const embed = new EmbedBuilder()
    .setColor(COLORS.active)
    .setAuthor({ name: 'GIVEAWAY', iconURL: guildIconUrl || undefined })
    .setTitle(clip(`🎁 ${safePrize}`, 256))
    .setDescription(
      [
        '**React with 🎉 to enter!**',
        '',
        '_One entry per person · random draw when the timer ends_',
      ].join('\n')
    )
    .addFields(
      { name: '🏆 Winners', value: `**${winnersCount}**`, inline: true },
      { name: '👑 Hosted by', value: `<@${hostId}>`, inline: true },
      { name: '⏳ Ends', value: `<t:${endsAt}:R>`, inline: true }
    )
    .setFooter({ text: 'Good luck! • Click 🎉 to join' })
    .setTimestamp(endsAt * 1000);

  return embed;
}

/**
 * The post after the timer ran out with at least one valid entry.
 *
 * @param {{ prize: string, winners: string[], entries: number, hostId?: string | null, guildIconUrl?: string | null, endedAt?: number }} input
 * @returns {EmbedBuilder}
 */
function buildGiveawayEndedEmbed({
  prize,
  winners,
  entries = 0,
  hostId = null,
  guildIconUrl = null,
  endedAt = Date.now(),
}) {
  const safePrize = clip(prize, 200) || 'Mystery prize';
  const winnerList = Array.isArray(winners) ? winners.filter(Boolean) : [];
  const shownWinners = winnerList.slice(0, 10);
  const hiddenWinners = winnerList.length - shownWinners.length;
  const winnerMentions =
    `${shownWinners.join(', ')}${hiddenWinners > 0 ? ` and **${hiddenWinners}** more` : ''}` || '—';
  const endedSeconds = toSeconds(endedAt);

  const embed = new EmbedBuilder()
    .setColor(COLORS.won)
    .setAuthor({ name: 'GIVEAWAY ENDED', iconURL: guildIconUrl || undefined })
    .setTitle(clip(`🎁 ${safePrize}`, 256))
    .setDescription(
      [
        `### 🎊 ${winnerList.length === 1 ? 'Winner' : 'Winners'}`,
        winnerMentions,
        '',
        `**Congratulations!** You won **${safePrize}**.`,
      ].join('\n')
    )
    .addFields(
      { name: '🎟️ Entries', value: `**${entries}**`, inline: true },
      { name: '👑 Hosted by', value: hostId ? `<@${hostId}>` : '—', inline: true },
      { name: '⏳ Ended', value: `<t:${endedSeconds}:d>`, inline: true }
    )
    .setFooter({ text: 'Thanks for joining!' })
    .setTimestamp(endedSeconds * 1000);

  return embed;
}

/**
 * The post when nobody entered in time.
 *
 * @param {{ prize: string, hostId?: string | null, guildIconUrl?: string | null, endedAt?: number }} input
 * @returns {EmbedBuilder}
 */
function buildGiveawayEmptyEmbed({
  prize,
  hostId = null,
  guildIconUrl = null,
  endedAt = Date.now(),
}) {
  const safePrize = clip(prize, 200) || 'Mystery prize';
  const endedSeconds = toSeconds(endedAt);

  const embed = new EmbedBuilder()
    .setColor(COLORS.empty)
    .setAuthor({ name: 'GIVEAWAY ENDED', iconURL: guildIconUrl || undefined })
    .setTitle(clip(`🎁 ${safePrize}`, 256))
    .setDescription(
      ['❌ **No valid entries.**', '', 'Nobody reacted with 🎉 before the timer ran out.'].join(
        '\n'
      )
    )
    .addFields(
      { name: '🎟️ Entries', value: '**0**', inline: true },
      { name: '👑 Hosted by', value: hostId ? `<@${hostId}>` : '—', inline: true },
      { name: '⏳ Ended', value: `<t:${endedSeconds}:d>`, inline: true }
    )
    .setFooter({ text: 'No winners this time — better luck next round!' })
    .setTimestamp(endedSeconds * 1000);

  return embed;
}

module.exports = {
  COLORS,
  buildGiveawayEmbed,
  buildGiveawayEndedEmbed,
  buildGiveawayEmptyEmbed,
};
