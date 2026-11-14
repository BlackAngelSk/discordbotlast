// @ts-check
/**
 * Test-alert senders shared by the `alerts` settings category and the panels.
 *
 * Every sender posts into the channel the guild already configured and returns
 * a one-line result for the caller to show. Missing config throws a readable
 * error so a panel can report it instead of pretending the alert was sent —
 * the same contract the web dashboard routes used.
 */

const epicGamesAlertsManager = require('../steam/epicGamesAlertsManager');
const steamFreeGamesAlertsManager = require('../steam/steamFreeGamesAlertsManager');
const steamGameUpdatesManager = require('../steam/steamGameUpdatesManager');

/**
 * @param {import('discord.js').Guild} guild
 * @param {string | null | undefined} channelId
 * @param {string} label
 * @returns {any}
 */
function resolveChannel(guild, channelId, label) {
  if (!channelId) throw new Error(`${label} is not configured — pick a channel first`);
  const channel = guild?.channels?.cache?.get(String(channelId));
  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    throw new Error(`The configured ${label.toLowerCase()} no longer exists`);
  }
  return channel;
}

/**
 * @param {any} channel
 * @param {any[]} payloads
 * @returns {Promise<number>}
 */
async function sendAll(channel, payloads) {
  let sent = 0;
  for (const payload of payloads || []) {
    await channel.send(payload);
    sent += 1;
  }
  return sent;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function sendEpicTest(guild, guildId) {
  const config = epicGamesAlertsManager.getGuildConfig(guildId);
  const channel = resolveChannel(guild, config?.channelId, 'Epic Games channel');

  const snapshot = await epicGamesAlertsManager.fetchSnapshot();
  const payload = epicGamesAlertsManager.buildCurrentAlert(snapshot);
  if (!payload) throw new Error('Epic Games has no free games right now');

  const sent = await sendAll(channel, payload.messages);
  return `🧪 Sent ${sent} Epic Games test message(s) to #${channel.name}`;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function sendSteamFreeTest(guild, guildId) {
  const config = steamFreeGamesAlertsManager.getGuildConfig(guildId);
  const channel = resolveChannel(guild, config?.channelId, 'Steam free-games channel');

  const snapshot = await steamFreeGamesAlertsManager.fetchSnapshot();
  const payload = steamFreeGamesAlertsManager.buildCurrentAlert(snapshot);
  if (!payload) throw new Error('Steam returned no free-to-keep games right now');

  const sent = await sendAll(channel, payload.messages);
  return `🧪 Sent ${sent} Steam free-game test message(s) to #${channel.name}`;
}

/**
 * Deals and promos share one channel (`enablePromoAlerts`), so the test posts
 * both batches the same way the dashboard route did.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function sendSteamDealsTest(guild, guildId) {
  const config = steamFreeGamesAlertsManager.getPromoGuildConfig(guildId);
  const channel = resolveChannel(guild, config?.channelId, 'Steam deals channel');

  const snapshot = await steamFreeGamesAlertsManager.fetchSnapshot();
  const settings = steamFreeGamesAlertsManager.getPromoDealSettings(guildId);
  const current = await steamFreeGamesAlertsManager
    .getCurrentDeals(guildId, { limit: settings.maxDealsPerMessage })
    .catch(() => ({ deals: [], settings: {}, totalCount: 0 }));

  let sent = 0;
  if (current.deals.length > 0) {
    const dealPayload = steamFreeGamesAlertsManager.buildDealAlert(
      current.deals,
      current.settings,
      { totalAvailable: current.totalCount }
    );
    sent += await sendAll(channel, dealPayload.messages);
  }

  const promoPayload = steamFreeGamesAlertsManager.buildPromoAlert(snapshot);
  if (promoPayload) sent += await sendAll(channel, promoPayload.messages);

  if (sent === 0) throw new Error('No Steam deals or promos are available right now');
  return `🧪 Sent ${sent} Steam deal test message(s) to #${channel.name}`;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function sendSteamUpdatesTest(guild, guildId) {
  const config = steamGameUpdatesManager.getGuildConfig(guildId);
  const channel = resolveChannel(guild, config?.channelId, 'Steam updates channel');

  const payloads = await steamGameUpdatesManager.buildTestAlerts(guildId);
  if (!payloads.length) throw new Error('Steam returned no recent update posts');

  const sent = await sendAll(channel, payloads);
  return `🧪 Sent ${sent} Steam update test message(s) to #${channel.name}`;
}

module.exports = {
  resolveChannel,
  sendEpicTest,
  sendSteamFreeTest,
  sendSteamDealsTest,
  sendSteamUpdatesTest,
};
