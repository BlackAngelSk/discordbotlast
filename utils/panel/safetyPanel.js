// @ts-check
/**
 * Safety panel for /dashboard.
 *
 * Surfaces the two things the web Safety Center could do that settings alone
 * cannot: flip server lockdown and show the live raid-protection posture.
 * The detailed knobs live in the `safety` settings category, linked here.
 *
 * CustomIds: `safety:*:{token}`.
 */

const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const raidProtectionManager = require('../raidProtectionManager');
const settingsManager = require('../core/settingsManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;

/**
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildMainEmbed(guild) {
  const guildId = String(guild.id);
  const locked = raidProtectionManager.isLocked(guildId);
  const raid = raidProtectionManager.getSettings(guildId);
  const settings = settingsManager.get(guildId) || {};

  const starboard = settings.starboardChannel
    ? `<#${settings.starboardChannel}> · ${settings.starboardThreshold ?? 3} ⭐`
    : 'Not configured';

  return new EmbedBuilder()
    .setColor(locked ? Colors.Red : Colors.Green)
    .setAuthor({ name: 'Safety', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle(locked ? '🔒 Server is locked down' : '🛡️ Safety')
    .setDescription(
      locked
        ? 'New members are being held back. Lift the lockdown once the incident is over.'
        : 'Raid protection, verification and starboard at a glance.'
    )
    .addFields(
      {
        name: '🚨 Raid protection',
        value: raid.enabled ? `On · ${raid.joinRateLimit} joins / ${raid.timeWindow}s` : 'Off',
        inline: true,
      },
      {
        name: '✅ Verification',
        value: raid.verificationEnabled
          ? raid.verificationRole
            ? `<@&${raid.verificationRole}>`
            : 'On · no role set'
          : 'Off',
        inline: true,
      },
      { name: '⭐ Starboard', value: starboard, inline: true },
      {
        name: '🔒 Lockdown',
        value: locked ? 'Active' : 'Inactive',
        inline: true,
      },
      {
        name: '⏳ Account age gate',
        value: raid.enabled ? `${raid.accountAgeRequired} days` : 'Off',
        inline: true,
      },
      {
        name: '🤖 Auto-kick',
        value: raid.autoKickRaiders ? 'Raiders' : raid.autoKickNewAccounts ? 'New accounts' : 'Off',
        inline: true,
      }
    )
    .setFooter({ text: 'Detailed thresholds live in Safety settings' })
    .setTimestamp();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} token
 * @returns {any[]}
 */
function buildMainRows(guild, token) {
  const locked = raidProtectionManager.isLocked(String(guild.id));

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`safety:lockdown:${token}`)
        .setLabel(locked ? 'Lift lockdown' : 'Start lockdown')
        .setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji(locked ? '🔓' : '🔒'),
      new ButtonBuilder()
        .setCustomId(`safety:settings:${token}`)
        .setLabel('Safety settings')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛡️'),
      new ButtonBuilder()
        .setCustomId(`safety:refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`safety:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {any} interaction
 * @param {string} userId
 * @param {number} [time]
 * @returns {Promise<any | null>}
 */
async function awaitSafetyComponent(interaction, userId, time = TIMEOUT) {
  return awaitComponentSafe(
    interaction,
    (/** @type {any} */ i) => String(i.customId).startsWith('safety:') && i.user.id === userId,
    time
  );
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runSafetyPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;
  const guildId = String(guild.id);

  await firstUpdate
    .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
    .catch(() => {});

  while (true) {
    const collected = await awaitSafetyComponent(interaction, userId);
    if (!collected) return 'timeout';

    const id = String(collected.customId);

    if (id === `safety:back:${token}`) return 'back';

    if (id === `safety:refresh:${token}`) {
      await collected
        .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
        .catch(() => {});
      continue;
    }

    if (id === `safety:lockdown:${token}`) {
      const locked = raidProtectionManager.isLocked(guildId);
      try {
        await raidProtectionManager.setLockdown(guildId, !locked);
        await collected
          .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
          .catch(() => {});
      } catch (error) {
        await collected
          .reply({
            content: `❌ Could not ${locked ? 'lift' : 'start'} the lockdown: ${
              /** @type {any} */ (error)?.message || error
            }`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
      continue;
    }

    if (id === `safety:settings:${token}`) {
      const { embed, components } = engine.renderCategory(guild, 'safety', token);
      await collected.update({ embeds: [embed], components }).catch(() => {});
      await engine.categoryLoop(interaction, 'safety', token, { skipBackRender: true });
      await interaction
        .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  buildMainEmbed,
  buildMainRows,
  runSafetyPanel,
};
