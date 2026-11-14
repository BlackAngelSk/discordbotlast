// @ts-check
/**
 * /dashboard — one ephemeral message that reaches every server panel.
 *
 * The hub is a router: it renders a menu of panels and, for each choice, hands
 * off to the module that owns it. Settings panels are served by
 * utils/panel/settingsEngine.js (the engine that used to live inside
 * slashCommands/admin/setup.js); later phases plug their own panels into
 * PANEL_GROUPS without touching the hub loop.
 *
 * Component customIds: `dashboard:{kind}:{token}` so the loop only reacts to its
 * own message, and `setup:*` ids inside a settings category stay untouched.
 */

const {
  EmbedBuilder,
  Colors,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const engine = require('./settingsEngine');
const economyPanel = require('./economyPanel');

/** Panels that are not settings categories (custom flows). */
const CUSTOM_PANELS = [
  {
    value: 'custom:economy',
    label: 'Economy',
    emoji: '💰',
    description: 'Balances, leaderboard, season board',
  },
];

const HUB_TIMEOUT = engine.COMPONENT_TIMEOUT;

const CATEGORY_EMOJI = {
  general: '⚙️',
  welcome: '👋',
  leave: '🚪',
  logging: '📝',
  moderation: '🛡️',
  automod: '🤖',
  safety: '🚨',
  voice: '🔊',
  tickets: '🎫',
  suggestions: '💡',
  alerts: '🔔',
  commands: '⌨️',
  serverprofile: '🏷️',
  season: '🏆',
  steam: '🎮',
  telegram: '📨',
};

/**
 * @returns {string}
 */
function randomToken() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * The panel menu. Settings categories are generated from the engine catalog;
 * future phases append standalone panels here.
 *
 * @returns {{ id: string, label: string, description: string, emoji: string }[]}
 */
function listPanels() {
  const settings = engine.CATEGORY_IDS.map((id) => ({
    value: id,
    label: engine.CATEGORY_LABELS[id] || id,
    description: `Configure ${(engine.CATEGORY_LABELS[id] || id).toLowerCase()}`,
    emoji: CATEGORY_EMOJI[id] || '⚙️',
  }));

  return [...settings, ...CUSTOM_PANELS];
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 * @returns {EmbedBuilder}
 */
function buildHubEmbed(guild, client) {
  const panels = listPanels();
  const ping = Math.max(0, Math.round(client?.ws?.ping || 0));

  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: 'Server dashboard', iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(`🛠 ${guild.name}`)
    .setDescription(
      [
        'Everything this bot can do for your server, in one message.',
        '',
        '_Pick a panel from the menu below. `/setup view` still prints every value._',
      ].join('\n')
    )
    .addFields(
      {
        name: '⚙️ Settings panels',
        value: `${panels.length} categories`,
        inline: true,
      },
      { name: '👥 Members', value: String(guild.memberCount || 0), inline: true },
      { name: '📡 Gateway', value: `${ping} ms`, inline: true }
    )
    .setFooter({ text: 'Menu closes after 10 minutes of inactivity' })
    .setTimestamp();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} token
 * @returns {any[]}
 */
function buildHubRows(guild, token) {
  const panels = listPanels();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`dashboard:panel:${token}`)
    .setPlaceholder('Open a settings panel…')
    .addOptions(
      panels
        .slice(0, 25)
        .map((panel) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(panel.label)
            .setValue(panel.value)
            .setDescription(panel.description)
            .setEmoji(panel.emoji)
        )
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dashboard:view:${token}`)
      .setLabel('View all settings')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId(`dashboard:refresh:${token}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(`dashboard:close:${token}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('✖️')
  );

  return [new ActionRowBuilder().addComponents(menu), buttons];
}

/**
 * Flatten the catalog into display rows for the "view all" panel.
 *
 * @param {string} guildId
 * @returns {{ category: string, label: string, value: string }[]}
 */
function buildSettingRows(guildId) {
  const rows = [];

  for (const category of engine.CATEGORY_IDS) {
    for (const setting of engine.SETTINGS[category] || []) {
      if (setting.kind === 'commandlist') {
        const commands = engine.getCustomCommands(guildId);
        rows.push({
          category,
          label: 'Custom commands',
          value: commands.length ? commands.map((c) => c.name).join(', ') : '*none*',
        });
      } else {
        rows.push({
          category,
          label: setting.label,
          value: engine.formatValue(engine.readSetting(setting, guildId)).replace(/\n/g, ' '),
        });
      }
    }
  }

  return rows;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ category: string, label: string, value: string }[]} rows
 * @param {number} page
 * @param {number} totalPages
 * @returns {EmbedBuilder}
 */
function buildSettingsPage(guild, rows, page, totalPages) {
  const pageRows = rows.slice(page * engine.VIEW_PAGE_SIZE, (page + 1) * engine.VIEW_PAGE_SIZE);
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({
      name: 'Server configuration',
      iconURL: guild.iconURL({ size: 64 }) ?? undefined,
    })
    .setTitle('📋 All settings')
    .setDescription('Read-only overview. Open a panel from `/dashboard` to change a value.')
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${rows.length} settings` });

  for (const row of pageRows) {
    embed.addFields({
      name: `${engine.CATEGORY_LABELS[row.category] || row.category} — ${row.label}`,
      value: row.value ? `> ${row.value}` : '> *not set*',
      inline: false,
    });
  }

  if (!pageRows.length) {
    embed.addFields({ name: 'No settings', value: 'This page is empty.', inline: false });
  }

  return embed;
}

/**
 * @param {string} token
 * @param {number} page
 * @param {number} totalPages
 * @returns {any}
 */
function buildSettingsNav(token, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dashboard:prev:${token}`)
      .setLabel('‹ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`dashboard:next:${token}`)
      .setLabel('Next ›')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`dashboard:back:${token}`)
      .setLabel('Back to dashboard')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('↩️')
  );
}

/**
 * Await the next component on the hub message.
 *
 * @param {any} interaction
 * @param {string} userId
 * @param {number} [time]
 * @returns {Promise<any | null>}
 */
async function awaitHubComponent(interaction, userId, time = HUB_TIMEOUT) {
  try {
    return await Promise.race([
      interaction.channel.awaitMessageComponent({
        filter: (/** @type {any} */ i) =>
          String(i.customId).startsWith('dashboard:') && i.user.id === userId,
        time,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), time)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Open the dashboard hub on an interaction that has NOT been replied to yet.
 *
 * @param {any} interaction
 * @returns {Promise<void>}
 */
async function openHub(interaction) {
  const guild = interaction.guild;
  const userId = interaction.user.id;
  const token = randomToken();

  await interaction
    .reply({
      embeds: [buildHubEmbed(guild, interaction.client)],
      components: /** @type {any} */ (buildHubRows(guild, token)),
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});

  while (true) {
    const collected = await awaitHubComponent(interaction, userId);
    if (!collected) return;

    const id = String(collected.customId);

    if (id === `dashboard:panel:${token}`) {
      const category = String(collected.values?.[0] || '');
      if (!category) {
        await collected.deferUpdate().catch(() => {});
        continue;
      }

      if (category === 'custom:economy') {
        const result = await economyPanel.runEconomyPanel({
          interaction,
          guild,
          userId,
          token,
          firstUpdate: collected,
        });

        if (result === 'timeout') return;

        await interaction
          .editReply({
            embeds: [buildHubEmbed(guild, interaction.client)],
            components: /** @type {any} */ (buildHubRows(guild, token)),
          })
          .catch(() => {});
        continue;
      }

      const { embed, components } = engine.renderCategory(guild, category, token);
      await collected.update({ embeds: [embed], components }).catch(() => {});
      const result = await engine.categoryLoop(interaction, category, token, {
        skipBackRender: true,
      });

      if (result === 'done' || result === 'timeout') return;

      await interaction
        .editReply({
          embeds: [buildHubEmbed(guild, interaction.client)],
          components: /** @type {any} */ (buildHubRows(guild, token)),
        })
        .catch(() => {});
      continue;
    }

    if (id === `dashboard:view:${token}`) {
      const rows = buildSettingRows(String(guild.id));
      const totalPages = Math.max(1, Math.ceil(rows.length / engine.VIEW_PAGE_SIZE));
      let page = 0;

      await collected
        .update({
          embeds: [buildSettingsPage(guild, rows, page, totalPages)],
          components: /** @type {any} */ ([buildSettingsNav(token, page, totalPages)]),
        })
        .catch(() => {});

      while (true) {
        const nav = await awaitHubComponent(interaction, userId);
        if (!nav) return;
        const navId = String(nav.customId);

        if (navId === `dashboard:back:${token}` || navId === `dashboard:close:${token}`) {
          await nav
            .update({
              embeds: [buildHubEmbed(guild, interaction.client)],
              components: /** @type {any} */ (buildHubRows(guild, token)),
            })
            .catch(() => {});
          break;
        }

        if (navId === `dashboard:prev:${token}` || navId === `dashboard:next:${token}`) {
          page =
            navId === `dashboard:next:${token}`
              ? Math.min(totalPages - 1, page + 1)
              : Math.max(0, page - 1);
          await nav
            .update({
              embeds: [buildSettingsPage(guild, rows, page, totalPages)],
              components: /** @type {any} */ ([buildSettingsNav(token, page, totalPages)]),
            })
            .catch(() => {});
          continue;
        }

        await nav.deferUpdate().catch(() => {});
      }
      continue;
    }

    if (id === `dashboard:refresh:${token}`) {
      await collected
        .update({
          embeds: [buildHubEmbed(guild, interaction.client)],
          components: /** @type {any} */ (buildHubRows(guild, token)),
        })
        .catch(() => {});
      continue;
    }

    if (id === `dashboard:close:${token}`) {
      await collected
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Grey)
              .setTitle('Dashboard closed')
              .setDescription('Run `/dashboard` any time to open it again.'),
          ],
          components: [],
        })
        .catch(() => {});
      return;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  CATEGORY_EMOJI,
  CUSTOM_PANELS,
  listPanels,
  buildHubEmbed,
  buildHubRows,
  buildSettingRows,
  buildSettingsPage,
  buildSettingsNav,
  openHub,
  HUB_TIMEOUT,
};
