// @ts-check
/**
 * Live alerts panel — Twitch "went live" and YouTube "new upload" watches.
 *
 * The web page's three forms collapse into one message: pick the target channel
 * and an optional mention role with native pickers, then add / remove / test a
 * watch. `liveAlertsManager` owns the polling and the data file.
 *
 * CustomIds: `live:*:{token}`.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  MessageFlags,
} = require('discord.js');

const liveAlertsManager = require('../liveAlertsManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe, awaitModalSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;
const MAX_ALERTS = 25;

/**
 * @returns {{ twitch: boolean, youtube: boolean }}
 */
function apiStatus() {
  return {
    twitch: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
  };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} channelId
 * @returns {string}
 */
function channelLabel(guild, channelId) {
  const channel = guild?.channels?.cache?.get(String(channelId));
  return channel ? `#${channel.name}` : `<#${channelId}>`;
}

/**
 * Flat, index-addressed list of watches. Select-menu values stay short
 * (`twitch:0`) so long YouTube URLs can never hit Discord's 100-char id cap.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {{ platform: 'twitch' | 'youtube', index: number, label: string, description: string }[]}
 */
function listAlertOptions(guild) {
  const alerts = liveAlertsManager.getAlerts(String(guild.id));
  const twitch = (alerts.twitch || []).map(
    (/** @type {any} */ entry, /** @type {number} */ index) => ({
      platform: /** @type {'twitch'} */ ('twitch'),
      index,
      label: `🟣 ${entry.username}`,
      description: channelLabel(guild, entry.channelId).slice(0, 100),
    })
  );
  const youtube = (alerts.youtube || []).map(
    (/** @type {any} */ entry, /** @type {number} */ index) => ({
      platform: /** @type {'youtube'} */ ('youtube'),
      index,
      label: `🔴 ${String(entry.channelName || entry.channelId).slice(0, 95)}`,
      description: channelLabel(guild, entry.discordChannelId).slice(0, 100),
    })
  );

  return [...twitch, ...youtube].slice(0, MAX_ALERTS);
}

/**
 * @param {string} token
 * @returns {ActionRowBuilder<StringSelectMenuBuilder>}
 */
function buildEntrySelect(token) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`live:entry:${token}`)
    .setPlaceholder('Choose a watch…');
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ channelId?: string | null, roleId?: string | null }} [state]
 * @returns {EmbedBuilder}
 */
function buildEmbed(guild, state = {}) {
  const alerts = liveAlertsManager.getAlerts(String(guild.id));
  const twitch = alerts.twitch || [];
  const youtube = alerts.youtube || [];
  const api = apiStatus();

  /**
   * @param {any[]} list
   * @param {(entry: any) => string} line
   * @returns {string}
   */
  const renderList = (list, line) => {
    if (!list.length) return '*none yet*';
    const shown = list.slice(0, 8).map((entry) => `• ${line(entry)}`);
    if (list.length > 8) shown.push(`…and ${list.length - 8} more`);
    return shown.join('\n').slice(0, 1024);
  };

  const target = state.channelId
    ? `${channelLabel(guild, state.channelId)}${state.roleId ? ` · <@&${state.roleId}>` : ''}`
    : '*pick a channel below*';

  return new EmbedBuilder()
    .setColor(0x9146ff)
    .setAuthor({ name: 'Live alerts', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('📡 Stream & video alerts')
    .setDescription(
      'Watch a Twitch channel for going live, or a YouTube channel for new uploads. Pick a target channel, then add a watch.'
    )
    .addFields(
      {
        name: '🟣 Twitch',
        value: renderList(
          twitch,
          (entry) => `**${entry.username}** → ${channelLabel(guild, entry.channelId)}`
        ),
        inline: false,
      },
      {
        name: '🔴 YouTube',
        value: renderList(
          youtube,
          (entry) =>
            `**${entry.channelName || entry.channelId}** → ${channelLabel(guild, entry.discordChannelId)}`
        ),
        inline: false,
      },
      { name: '🎯 Target', value: target, inline: true },
      {
        name: '🔑 APIs',
        value: `Twitch ${api.twitch ? '✅' : '⚠️ missing keys'} · YouTube ${api.youtube ? '✅' : '⚠️ missing key'}`,
        inline: true,
      }
    )
    .setFooter({ text: `${twitch.length} Twitch · ${youtube.length} YouTube watches` })
    .setTimestamp();
}

/**
 * @param {string} token
 * @returns {any[]}
 */
function buildRows(token) {
  const channelPicker = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`live:channel:${token}`)
      .setPlaceholder('Alert channel…')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const rolePicker = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`live:role:${token}`)
      .setPlaceholder('Mention role (optional)…')
      .setMinValues(1)
      .setMaxValues(1)
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`live:addtwitch:${token}`)
      .setLabel('Add Twitch')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🟣'),
    new ButtonBuilder()
      .setCustomId(`live:addyoutube:${token}`)
      .setLabel('Add YouTube')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔴'),
    new ButtonBuilder()
      .setCustomId(`live:test:${token}`)
      .setLabel('Test')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧪'),
    new ButtonBuilder()
      .setCustomId(`live:remove:${token}`)
      .setLabel('Remove')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId(`live:clearrole:${token}`)
      .setLabel('Clear role')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✖️')
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`live:refresh:${token}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(`live:back:${token}`)
      .setLabel('Dashboard')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('↩️')
  );

  return [channelPicker, rolePicker, actions, nav];
}

/**
 * @param {string} customId
 * @param {string} title
 * @param {string} label
 * @param {string} placeholder
 * @returns {ModalBuilder}
 */
function buildIdentifierModal(customId, title, label, placeholder) {
  const input = new TextInputBuilder()
    .setCustomId('identifier')
    .setLabel(label.slice(0, 45))
    .setPlaceholder(placeholder.slice(0, 100))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(/** @type {any} */ (new ActionRowBuilder().addComponents(input)));
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runLiveAlertsPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;
  const guildId = String(guild.id);
  /** @type {{ channelId: string | null, roleId: string | null }} */
  const state = { channelId: null, roleId: null };

  /**
   * @param {any} target interaction to acknowledge
   */
  const render = async (target) => {
    await target
      .update({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
      .catch(() => {});
  };

  await firstUpdate
    .update({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
    .catch(() => {});

  while (true) {
    const collected = await awaitComponentSafe(
      interaction,
      (/** @type {any} */ i) => String(i.customId).startsWith('live:') && i.user.id === userId,
      TIMEOUT
    );
    if (!collected) return 'timeout';

    const id = String(collected.customId).split(':');
    const kind = id[1];

    if (kind === 'back') return 'back';

    if (kind === 'refresh') {
      await render(collected);
      continue;
    }

    if (kind === 'channel' || kind === 'role') {
      const value = collected.values?.[0] || null;
      if (kind === 'channel') state.channelId = value;
      else state.roleId = value;
      await render(collected);
      continue;
    }

    if (kind === 'clearrole') {
      state.roleId = null;
      await render(collected);
      continue;
    }

    if (kind === 'addtwitch' || kind === 'addyoutube') {
      const platform = kind === 'addtwitch' ? 'twitch' : 'youtube';

      if (!state.channelId) {
        await collected
          .reply({ content: 'Pick the alert channel first.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
        continue;
      }

      const modalCustomId = `live:modal:${platform}:${token}`;
      const modal =
        platform === 'twitch'
          ? buildIdentifierModal(
              modalCustomId,
              'Add Twitch alert',
              'Twitch username',
              'streamername'
            )
          : buildIdentifierModal(
              modalCustomId,
              'Add YouTube alert',
              'Channel ID, URL or @handle',
              'UCxxxxxxxxxxxxxxxx or @handle'
            );

      await collected.showModal(modal);
      const submit = await awaitModalSafe(
        collected,
        (/** @type {any} */ i) => i.customId === modalCustomId && i.user.id === userId,
        TIMEOUT
      );
      if (!submit) continue;

      const identifier = String(submit.fields.getTextInputValue('identifier') || '').trim();
      if (!identifier) {
        await submit
          .reply({ content: 'A channel identifier is required.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
        continue;
      }

      await submit.deferUpdate().catch(() => {});
      try {
        if (platform === 'twitch') {
          await liveAlertsManager.addTwitchAlert(
            guildId,
            identifier,
            state.channelId,
            state.roleId
          );
        } else {
          await liveAlertsManager.addYouTubeAlert(
            guildId,
            identifier,
            state.channelId,
            state.roleId
          );
        }
        await submit
          .followUp({
            content: `✅ ${platform === 'twitch' ? 'Twitch' : 'YouTube'} watch for **${identifier}** saved to ${channelLabel(guild, state.channelId)}.`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      } catch (error) {
        await submit
          .followUp({
            content: `❌ Could not save the watch: ${/** @type {any} */ (error)?.message || error}`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

      await submit
        .editReply({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
        .catch(() => {});
      continue;
    }

    if (kind === 'remove' || kind === 'test') {
      const options = listAlertOptions(guild);
      if (!options.length) {
        await collected
          .reply({
            content: 'No watches yet — add one first.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        continue;
      }

      const menu = buildEntrySelect(token);
      const select = /** @type {any} */ (menu.components[0]);
      select
        .setCustomId(kind === 'remove' ? `live:removal:${token}` : `live:trial:${token}`)
        .setPlaceholder(kind === 'remove' ? 'Choose a watch to remove…' : 'Choose a watch to test…')
        .addOptions(
          options.map((option) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(option.label.slice(0, 100))
              .setDescription(option.description)
              .setValue(`${option.platform}:${option.index}`)
          )
        );

      await collected
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(kind === 'remove' ? 0xed4245 : 0x5865f2)
              .setTitle(kind === 'remove' ? '🗑️ Remove a watch' : '🧪 Test a watch')
              .setDescription(
                kind === 'remove'
                  ? 'Pick the watch to delete.'
                  : 'This posts a fake alert into the watch channel.'
              ),
          ],
          components: [menu],
        })
        .catch(() => {});
      continue;
    }

    if (kind === 'removal' || kind === 'trial') {
      const [platform, indexRaw] = String(collected.values?.[0] || '').split(':');
      const alerts = liveAlertsManager.getAlerts(guildId);
      const list = platform === 'twitch' ? alerts.twitch || [] : alerts.youtube || [];
      const entry = list[Number(indexRaw)];

      if (!entry) {
        await collected
          .update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('Watch not found')
                .setDescription('It was already removed. Refreshing the panel.'),
            ],
            components: [],
          })
          .catch(() => {});
        await interaction
          .editReply({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
          .catch(() => {});
        continue;
      }

      if (kind === 'removal') {
        const identifier = platform === 'twitch' ? entry.username : entry.channelId;
        try {
          if (platform === 'twitch') await liveAlertsManager.removeTwitchAlert(guildId, identifier);
          else await liveAlertsManager.removeYouTubeAlert(guildId, identifier);
          await collected
            .update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x57f287)
                  .setTitle('Watch removed')
                  .setDescription(`Removed **${identifier}**.`),
              ],
              components: [],
            })
            .catch(() => {});
        } catch (error) {
          await collected
            .update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xed4245)
                  .setTitle('Could not remove the watch')
                  .setDescription(
                    String(/** @type {any} */ (error)?.message || error).slice(0, 900)
                  ),
              ],
              components: [],
            })
            .catch(() => {});
        }
        await interaction
          .editReply({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
          .catch(() => {});
        continue;
      }

      // test
      await collected.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const identifier = platform === 'twitch' ? entry.username : entry.channelId;
      let content;
      try {
        const result = await liveAlertsManager.sendTestAlert(guildId, platform, identifier);
        content = result?.success
          ? `🧪 Test alert sent to <#${result.channelId || entry.channelId}>.`
          : `❌ ${result?.error || 'Test alert failed.'}`;
      } catch (error) {
        content = `❌ Test alert failed: ${/** @type {any} */ (error)?.message || error}`;
      }
      await collected.editReply({ content }).catch(() => {});
      await interaction
        .editReply({ embeds: [buildEmbed(guild, state)], components: buildRows(token) })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  apiStatus,
  channelLabel,
  listAlertOptions,
  buildEmbed,
  buildRows,
  runLiveAlertsPanel,
};
