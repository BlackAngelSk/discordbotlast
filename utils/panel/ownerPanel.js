// @ts-check
/**
 * Bot owner panel — runtime, storage and owner-notification controls.
 *
 * Bot-wide, so the hub only lists it for `BOT_OWNER_ID`. Storage is SQLite
 * (the Mongo sync UI died with the SQLite migration), so this shows the live
 * database state instead of a sync schedule: file size, connection, error
 * count, and the same test DM the web owner page could send.
 *
 * CustomIds: `owner:*:{token}`.
 */

const fs = require('fs');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const databaseManager = require('../databaseManager');
const errorLogManager = require('../errorLogManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;

/**
 * @param {() => unknown} fn
 * @param {unknown} fallback
 * @returns {any}
 */
function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * @returns {string | null}
 */
function ownerId() {
  return process.env.BOT_OWNER_ID || null;
}

/**
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
function isOwner(userId) {
  const owner = ownerId();
  return Boolean(owner && userId && String(userId) === owner);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 * @returns {EmbedBuilder}
 */
function buildEmbed(guild, client) {
  const status = safe(() => databaseManager.getSyncStatus(), {}) || {};
  const dbPath = status.databasePath || null;
  const dbSize = dbPath && fs.existsSync(dbPath) ? fs.statSync(dbPath).size : null;
  const memory = process.memoryUsage();
  const errors24h = safe(
    () => errorLogManager.getRecentErrors({ days: 1, limit: 500 }).length,
    null
  );

  const storage = [
    `${status.usingStorage ? String(status.usingStorage).toUpperCase() : 'unknown'} · ${status.isConnected ? 'connected' : 'disconnected'}`,
    dbSize !== null ? formatBytes(dbSize) : 'size unavailable',
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: 'Bot owner', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('👑 Owner panel')
    .setDescription('Bot-wide controls. Nothing here is per-server.')
    .addFields(
      { name: '🗄️ Storage', value: storage, inline: true },
      {
        name: '🌐 Servers',
        value: `${client?.guilds?.cache?.size ?? 0} servers · ${client?.users?.cache?.size ?? 0} users`,
        inline: true,
      },
      {
        name: '🩺 Runtime',
        value: `${formatUptime(process.uptime())} · ${Math.max(0, Math.round(client?.ws?.ping || 0))} ms`,
        inline: true,
      },
      {
        name: '🧠 Memory',
        value: `${Math.round(memory.heapUsed / 1024 / 1024)} MB heap · ${Math.round(memory.rss / 1024 / 1024)} MB RSS`,
        inline: true,
      },
      {
        name: '🐞 Errors (24h)',
        value: errors24h === null ? '*unavailable*' : String(errors24h),
        inline: true,
      },
      {
        name: '⚙️ Mode',
        value: process.env.DEV_MODE === 'true' ? 'DEV' : 'Production',
        inline: true,
      },
      {
        name: '👤 Owner',
        value: [
          `BOT_OWNER_ID: \`${ownerId() || 'not configured'}\``,
          `Error DMs: \`${process.env.ERROR_DM_USER_ID || ownerId() || 'not configured'}\``,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📁 Database',
        value: dbPath ? `> \`${dbPath}\`` : '> *unknown*',
        inline: false,
      }
    )
    .setFooter({
      text: `Bot: ${client?.user?.tag || 'unknown'} · ${guild.name}`,
    })
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
        .setCustomId(`owner:notify:${token}`)
        .setLabel('Send test notification')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🧪'),
      new ButtonBuilder()
        .setCustomId(`owner:refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`owner:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {any} interaction
 * @param {any} client
 * @returns {Promise<string>}
 */
async function sendTestNotification(interaction, client) {
  const recipientId = process.env.ERROR_DM_USER_ID || ownerId();
  if (!recipientId) throw new Error('No owner notification recipient is configured');

  const recipient = await client.users.fetch(recipientId).catch(() => null);
  if (!recipient) throw new Error('The owner notification recipient could not be fetched');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🧪 Dashboard test notification')
    .setDescription('This is a test DM triggered from the in-Discord owner panel.')
    .addFields(
      {
        name: 'Triggered by',
        value: `${interaction.user?.username || 'Unknown'} (${interaction.user?.id || 'unknown'})`,
        inline: false,
      },
      { name: 'Bot', value: client?.user?.tag || 'unknown', inline: true },
      {
        name: 'Storage',
        value: safe(
          () => String(databaseManager.getSyncStatus()?.usingStorage || 'unknown'),
          'unknown'
        ),
        inline: true,
      }
    )
    .setTimestamp();

  await recipient.send({ embeds: [embed] });
  return `🧪 Test notification sent to ${recipient.username}.`;
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runOwnerPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;
  const client = interaction.client;

  if (!isOwner(userId)) {
    await firstUpdate
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Owner only')
            .setDescription('This panel is restricted to the bot owner.'),
        ],
        components: [],
      })
      .catch(() => {});
    return 'back';
  }

  const render = async (/** @type {any} */ target) => {
    await target
      .update({ embeds: [buildEmbed(guild, client)], components: buildRows(token) })
      .catch(() => {});
  };

  await render(firstUpdate);

  while (true) {
    const collected = await awaitComponentSafe(
      interaction,
      (/** @type {any} */ i) => String(i.customId).startsWith('owner:') && i.user.id === userId,
      TIMEOUT
    );
    if (!collected) return 'timeout';

    const id = String(collected.customId);

    if (id === `owner:back:${token}`) return 'back';

    if (id === `owner:refresh:${token}`) {
      await render(collected);
      continue;
    }

    if (id === `owner:notify:${token}`) {
      await collected.deferUpdate().catch(() => {});
      let content;
      try {
        content = await sendTestNotification(collected, client);
      } catch (error) {
        content = `❌ ${/** @type {any} */ (error)?.message || error}`;
      }
      await collected.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      await interaction
        .editReply({ embeds: [buildEmbed(guild, client)], components: buildRows(token) })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  isOwner,
  formatBytes,
  formatUptime,
  buildEmbed,
  buildRows,
  sendTestNotification,
  runOwnerPanel,
};
