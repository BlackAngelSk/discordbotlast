// @ts-check
/**
 * /setup — kept as an alias for /dashboard.
 *
 *   /setup config  → opens the dashboard hub (same panel as /dashboard)
 *   /setup view    → read-only dump of every configured value (paginated)
 *   /setup reset   → restore core settings to defaults (confirm button)
 *
 * The catalog and the component flow live in utils/panel/settingsEngine.js so
 * the hub and this alias can never drift apart.
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const settingsManager = require('../../utils/core/settingsManager');
const engine = require('../../utils/panel/settingsEngine');
const { openHub } = require('../../utils/panel/hub');

const COMPONENT_TIMEOUT = engine.COMPONENT_TIMEOUT;

/**
 * Paginated read-only view of every setting.
 *
 * @param {any} interaction
 * @returns {Promise<void>}
 */
async function showConfigView(interaction) {
  const guild = interaction.guild;
  const guildId = String(interaction.guildId);
  const token = Math.random().toString(36).slice(2, 10);
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

  const totalPages = Math.max(1, Math.ceil(rows.length / engine.VIEW_PAGE_SIZE));

  /**
   * @param {number} page
   * @returns {import('discord.js').EmbedBuilder}
   */
  const build = (page) => {
    const pageRows = rows.slice(page * engine.VIEW_PAGE_SIZE, (page + 1) * engine.VIEW_PAGE_SIZE);
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({
        name: 'Server Configuration',
        iconURL: guild.iconURL({ size: 64 }) ?? undefined,
      })
      .setTitle('⚙️ /setup view')
      .setDescription('Current server configuration. Use `/setup config` to change values.')
      .setFooter({ text: `Page ${page + 1}/${totalPages} · ${rows.length} settings` });

    for (const row of pageRows) {
      embed.addFields({
        name: `${engine.CATEGORY_LABELS[row.category] || row.category} — ${row.label}`,
        value: row.value ? `> ${row.value}` : '',
        inline: false,
      });
    }
    if (!pageRows.length) {
      embed.addFields({ name: 'No settings', value: 'This page is empty.', inline: false });
    }
    return embed;
  };

  /**
   * @param {number} page
   * @returns {any}
   */
  const nav = (page) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`setup:pagination:${token}:prev`)
        .setLabel('‹ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`setup:pagination:${token}:next`)
        .setLabel('Next ›')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`setup:view-done:${token}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction
    .reply({
      embeds: [build(0)],
      components: /** @type {any} */ ([nav(0)]),
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});

  let page = 0;
  try {
    while (true) {
      const collected = await Promise.race([
        /** @type {any} */ (interaction.channel).awaitMessageComponent({
          filter: (/** @type {any} */ i) =>
            (i.customId.startsWith(`setup:pagination:${token}`) ||
              i.customId === `setup:view-done:${token}`) &&
            i.user.id === interaction.user.id,
          time: COMPONENT_TIMEOUT,
          componentType: 2,
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
      ]);
      if (!collected) break;
      if (collected.customId === `setup:view-done:${token}`) {
        await collected.deferUpdate().catch(() => {});
        break;
      }
      page = collected.customId.endsWith(':next')
        ? Math.min(totalPages - 1, page + 1)
        : Math.max(0, page - 1);
      await collected.update({ embeds: [build(page)], components: [nav(page)] }).catch(() => {});
    }
  } catch {
    /* timeout */
  }
}

/**
 * @param {any} interaction
 * @returns {Promise<void>}
 */
async function confirmReset(interaction) {
  const token = Math.random().toString(36).slice(2, 10);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setup:reset-confirm:${token}`)
      .setLabel('Yes, reset everything')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`setup:reset-cancel:${token}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction
    .reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('Reset server configuration?')
          .setDescription('This restores the core settings to defaults. This cannot be undone.'),
      ],
      components: /** @type {any} */ ([row]),
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});

  try {
    const confirm = await /** @type {any} */ (interaction.channel).awaitMessageComponent({
      filter: (/** @type {any} */ i) =>
        (i.customId === `setup:reset-confirm:${token}` ||
          i.customId === `setup:reset-cancel:${token}`) &&
        i.user.id === interaction.user.id,
      time: COMPONENT_TIMEOUT,
    });

    if (confirm.customId.startsWith('setup:reset-confirm')) {
      settingsManager.reset(String(interaction.guildId));
      await confirm
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Green)
              .setTitle('Configuration reset')
              .setDescription('Core settings restored to defaults.'),
          ],
          components: [],
        })
        .catch(() => {});
    } else {
      await confirm
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Grey)
              .setTitle('Reset cancelled')
              .setDescription('No changes made.'),
          ],
          components: [],
        })
        .catch(() => {});
    }
  } catch {
    /* timeout */
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Server configuration — alias for /dashboard')
    .setDefaultMemberPermissions(0x8n)
    .addSubcommand((sub) =>
      sub.setName('config').setDescription('Open the server dashboard (same as /dashboard).')
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Show the current server configuration.')
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Restore all settings to defaults (confirm in Discord).')
    ),

  /**
   * @param {any} interaction
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('Guild only')
              .setDescription('This command can only be used inside a server.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    const member = /** @type {any} */ (interaction.member);
    if (!member || !member.permissions.has('ManageGuild')) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('No permission')
              .setDescription('You need the **Manage Server** permission to use this command.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    const sub = /** @type {any} */ (interaction).options.getSubcommand();

    if (sub === 'view') {
      await showConfigView(interaction);
      return;
    }
    if (sub === 'reset') {
      await confirmReset(interaction);
      return;
    }

    await openHub(interaction);
  },
};
