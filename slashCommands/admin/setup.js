// @ts-check
/**
 * /setup — in-Discord server configuration for guild admins.
 *
 * Replaces the guild-configuration side of the web dashboard. Every write
 * funnels through the same settingsManager / loggingManager / moderation
 * manager / welcomeManager singletons the dashboard uses, so config edited
 * here stays in sync with what the rest of the bot reads at runtime.
 *
 * Subcommands:
 *   /setup view                            — dump current config (paginated embed)
 *   /setup reset                           — restore defaults (confirm via button)
 *   /setup config [category]               — interactive category flow
 *
 * The `config` flow is component-driven:
 *   ephemeral StringSelectMenu per category -> modals / channel selects /
 *   button toggles -> writes via the managers -> confirmation embeds.
 *
 * Route map (customId scheme: `setup:{sub}:{category}:{token}`):
 *   setup:select:{category}:{token}   — category navigation
 *   setup:channel:{category}:{token}  — channel picker (with `{choice}`)
 *   setup:modal:{category}:{token}    — free-text modal submit
 *   setup:toggle:{category}:{token}   — on/off button toggle
 *   setup:done:{category}:{token}     — finish config view
 *   setup:back:{category}:{token}     — return to category list
 *   setup:reset:{category}:{token}    — open reset confirm
 *   setup:reset-confirm:{token}       — confirm reset (also top-level customId `setup-reset-confirm`)
 *   setup:reset-cancel:{token}        — dismiss reset confirm
 *   setup:pagination:{token}:{dir}    — flip pages in /setup view
 *   setup:view-done:{token}           — dismiss the view embed
 *   setup:modal-cancel:{category}:{token} — cancel an open modal (no-op safety)
 *
 * Permission gating: Admin + ManageGuild. Components additionally verify the
 * actor is the invoking user via an interaction token.
 */

const { SlashCommandBuilder, EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

// ---------------------------------------------------------------------------
// Manager imports (the dashboard's own config surface — keep these in sync).
// ---------------------------------------------------------------------------
const settingsManager = require('../../utils/core/settingsManager');
const loggingManager = require('../../utils/loggingManager');
const moderationManager = require('../../utils/moderationManager');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPONENT_TIMEOUT = 600_000; // 10 minutes of interactivity
const VIEW_PAGE_SIZE = 8;           // settings rows per page in /setup view

/**
 * A single setting descriptor from the SETTINGS table below.
 *
 * @typedef {{
 *   key: string;
 *   kind: 'string' | 'channel' | 'toggle' | 'select' | 'modal-multi';
 *   label: string;
 *   hint?: string;
 *   maxLength?: number;
 *   minLength?: number;
 *   choices?: Array<{ label: string; value: string; type?: 'boolean' | 'string' }>;
 * }} SettingDescriptor
 */

/**
 * Category identifiers. These map 1:1 to the StringSelectMenu customId suffix
 * and to the switch() in renderCategory(). Add new categories here, then give
 * them a render branch, an inputs list and (if needed) a settings key list.
 *
 * @type {string[]}
 */
const CATEGORY_IDS = [
  'general',
  'welcome',
  'logging',
  'moderation',
  'features',
  'serverprofile',
];

/** Human-readable category names (labels for the picker).
 * @type {Record<string, string>}
 */
const CATEGORY_LABELS = {
  general: 'General & Prefixes',
  welcome: 'Welcome',
  logging: 'Logging',
  moderation: 'Moderation',
  features: 'Features',
  serverprofile: 'Server Profile',
};

// ---------------------------------------------------------------------------
// Setting descriptors: category -> [ key, kind, label, hint ]
//
// kind: 'string' | 'channel' | 'toggle' | 'select' | 'modal-multi'
// For 'channel': { choice } is appended to the customId by the picker.
// For 'toggle': writes booleans via button toggles.
// For 'select': choices is a {label, value}[]; value is stored verbatim.
//   type = 'boolean' -> "yes"/"no" display, stored as boolean.
//   type = 'string'  -> value stored as string.
// For 'modal-multi': free-text modal input; strings joined with '\n'.
//
// IMPORTANT: keys here are the ones the dashboard writes. If a key is missing
// from normalizeGuildSettings it is a custom key (e.g. serverProfile) and we
// still forward it verbatim through settingsManager.set().
// ---------------------------------------------------------------------------

/**
 * @type {Record<string, Array<{
 *   key: string;
 *   kind: 'string' | 'channel' | 'toggle' | 'select' | 'modal-multi';
 *   label: string;
 *   hint?: string;
 *   maxLength?: number;
 *   minLength?: number;
 *   choices?: Array<{ label: string; value: string; type?: 'boolean' | 'string' }>;
 * }>>}
 */
const SETTINGS = {
  general: [
    { key: 'prefix', kind: 'string', label: 'Command prefix', hint: 'Max 5 characters, no spaces. E.g. !', maxLength: 5, minLength: 1 },
  ],
  welcome: [
    { key: 'welcomeEnabled', kind: 'toggle', label: 'Welcome messages', hint: 'Send a message in the welcome channel when a member joins.' },
    { key: 'welcomeChannel', kind: 'channel', label: 'Welcome channel', hint: 'Where welcome messages are posted.' },
    { key: 'welcomeMessage', kind: 'modal-multi', label: 'Welcome message', hint: 'Line breaks supported. Placeholders: {user}, {server}.', maxLength: 1000, minLength: 1 },
  ],
  logging: [
    { key: 'loggingEnabled', kind: 'toggle', label: 'Logging', hint: 'Toggle the logging system on or off.' },
    { key: 'loggingChannel', kind: 'channel', label: 'Logging channel', hint: 'Channel that receives audit-log style events.' },
  ],
  moderation: [
    { key: 'modEnabled', kind: 'toggle', label: 'Moderation', hint: 'Toggle the moderation system.' },
    { key: 'modLogChannel', kind: 'channel', label: 'Moderation log channel', hint: 'Where moderation actions are logged.' },
  ],
  features: [
    { key: 'features', kind: 'toggle', label: 'Feature flags', hint: 'Master toggle for server features.' },
  ],
  serverprofile: [
    { key: 'serverProfile', kind: 'modal-multi', label: 'Server profile (JSON)', hint: 'Paste a JSON object. Advanced — malformed JSON will be rejected.', maxLength: 2000, minLength: 2 },
  ],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a setting descriptor for a given category and key.
 *
 * @param {string} category
 * @param {string} key
 * @returns {SettingDescriptor | undefined}
 */
function getSetting(category, key) {
  const list = SETTINGS[category] || [];
  return list.find((s) => s.key === key);
}

/**
 * Build a settings object from raw key/value pairs, applying dashboard-style
 * normalization for known boolean/JSON fields.
 *
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function normalizeValues(raw) {
  const out = { ...raw };

  // These dashboard keys are stored as booleans.
  for (const k of [
    'welcomeEnabled',
    'loggingEnabled',
    'modEnabled',
    'features',
  ]) {
    if (k in out && typeof out[k] !== 'boolean') {
      out[k] = out[k] === true || out[k] === 'true' || out[k] === 'yes';
    }
  }

  // dashboard stores features as a boolean; normalise accidental strings
  if ('features' in out) {
    out.features = out.features === true || out.features === 'true' || out.features === 'yes';
  }

  return out;
}

/**
 * Encode a category id into a safe customId segment.
 * Categories are a fixed whitelist, but encode defensively anyway.
 *
 * @param {string} category
 * @returns {string}
 */
function enc(category) {
  return category.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
}

/**
 * Decode a category segment back to its canonical id.
 *
 * @param {string} segment
 * @returns {string}
 */
function dec(segment) {
  return String(segment);
}

/**
 * Read the current value of a setting from a guild's settings object.
 *
 * @param {Record<string, unknown>} settings
 * @param {string} key
 * @returns {unknown}
 */
function getValue(settings, key) {
  if (key in settings) {
    return settings[key];
  }

  // Some keys live on the settingsManager only (e.g. serverProfile may be
  // stored on the raw settings). settingsManager.get returns the raw object;
  // be permissive.
  return undefined;
}

/**
 * Format a value for display in the embed.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === undefined || value === null) return '*not set*';
  if (typeof value === 'boolean') return value ? '✅ Enabled' : '❌ Disabled';
  if (typeof value === 'object') {
    try {
      return '```json\n' + JSON.stringify(value, null, 2).slice(0, 900) + '```';
    } catch {
      return '```' + String(value).slice(0, 900) + '```';
    }
  }
  const s = String(value);
  return s.length > 900 ? s.slice(0, 897) + '...' : s;
}

/**
 * Build a "current value" line for a setting in the view/category embed.
 *
 * @param {Record<string, unknown>} settings
 * @param {SettingDescriptor} setting
 * @returns {string}
 */
function valueLine(settings, setting) {
  const v = getValue(settings, setting.key);
  const formatted = formatValue(v).replace(/\n/g, ' ').slice(0, 80);
  return `> **${setting.label}** — ${formatted}`;
}

/**
 * Take a raw interaction string and turn it into a safe, single-line value
 * for a modal (max 1024 chars, discarding newlines).
 *
 * @param {unknown} v
 * @param {string} fallback
 * @returns {string}
 */
function toSingleLine(v, fallback = '') {
  const s = v === undefined || v === null ? fallback : String(v);
  return s.replace(/\r?\n/g, ' ').slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

/**
 * Build the /setup view embed with pagination.
 *
 * @param {import('discord.js').Guild | null} guild
 * @param {Record<string, unknown>} settings
 * @param {number} page 0-indexed
 * @returns {{ embed: import('discord.js').EmbedBuilder, page: number, totalPages: number }}
 */
function buildViewEmbed(guild, settings, page = 0) {
  const resolvedGuild = /** @type {import('discord.js').Guild} */ (guild);
  const rows = [];
  for (const category of CATEGORY_IDS) {
    for (const setting of SETTINGS[category] || []) {
      rows.push({ category, ...setting });
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / VIEW_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageRows = rows.slice(safePage * VIEW_PAGE_SIZE, (safePage + 1) * VIEW_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: 'Server Configuration', iconURL: resolvedGuild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('⚙️ /setup view')
    .setDescription('Current server configuration. Use `/setup config` to change values.')
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} · ${rows.length} settings` });

  const fields = pageRows.map((r) => ({
    name: `${CATEGORY_LABELS[r.category] || r.category} — ${r.label}`,
    value: valueLine(settings, r),
    inline: false,
  }));

  if (fields.length) {
    embed.addFields(fields);
  } else {
    embed.addFields([{ name: 'No settings', value: 'This page is empty.', inline: false }]);
  }

  return { embed, page: safePage, totalPages };
}

/**
 * Build the category picker (StringSelectMenu).
 *
 * @param {import('discord.js').Guild | null} guild
 * @param {Record<string, unknown>} settings
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildCategoryPicker(guild, settings) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup:select:__category__:token')
    .setPlaceholder('Choose a category…')
    .addOptions(
      CATEGORY_IDS.map((id) => new StringSelectMenuOptionBuilder()
        .setLabel(CATEGORY_LABELS[id] || id)
        .setValue(id)
        .setDescription(`Configure ${CATEGORY_LABELS[id] || id} settings`)
        .setEmoji(id === 'general' ? '⚙️' : id === 'welcome' ? '👋' : id === 'logging' ? '📜' : id === 'moderation' ? '🛡️' : id === 'features' ? '✨' : '🖥️'))
    );

  const row = new ActionRowBuilder().addComponents(menu);
  return row;
}

/**
 * Render a category's interactive view (embed + controls). The customIds are
 * generated with a per-interaction token for the actor checks.
 *
 * @param {import('discord.js').Guild | null} guild
 * @param {Record<string, unknown>} settings
 * @param {string} category
 * @param {string} token
 * @returns {{ embed: import('discord.js').EmbedBuilder, components: any[] }}
 */
function renderCategory(guild, settings, category, token) {
  const cat = dec(category);
  const list = SETTINGS[cat] || [];

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`${CATEGORY_LABELS[cat] || cat}`)
    .setDescription('Select a setting to change it.');

  const fields = list.map((s) => ({
    name: s.label,
    value: valueLine(settings, s),
    inline: false,
  }));

  if (fields.length) embed.addFields(fields);

  // Channel-style select for channel settings + text for the rest.
  // Each setting becomes its own button unless it's a channel picker.
  const buttonRow = new ActionRowBuilder();
  const components = [];

  for (const s of list) {
    const id = `setup:${s.kind === 'channel' ? 'channel' : 'modal'}:${enc(cat)}:${token}`;
    const b = new ButtonBuilder()
      .setCustomId(id)
      .setLabel(s.label)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(s.kind === 'toggle' ? '🔁' : '✏️');
    if (buttonRow.components.length < 5) {
      buttonRow.addComponents(b);
    } else {
      components.push(buttonRow);
      // no-op — realistically a category has at most 3 settings.
    }
  }

  if (buttonRow.components.length) components.push(buttonRow);

  // Bottom navigation row.
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setup:back:${enc(cat)}:${token}`)
      .setLabel('‹ Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('↩️'),
    new ButtonBuilder()
      .setCustomId(`setup:done:${enc(cat)}:${token}`)
      .setLabel('Done')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`setup:reset:${enc(cat)}:${token}`)
      .setLabel('Reset')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );
  components.push(nav);

  return { embed, components };
}

/**
 * Build a channel-select ActionRow for a channel setting.
 *
 * @param {import('discord.js').Guild | null} guild
 * @param {string} category
 * @param {string} key
 * @param {string} token
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildChannelPicker(guild, category, key, token) {
  const resolvedGuild = /** @type {import('discord.js').Guild} */ (guild);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`setup:channel:${enc(category)}:${token}`)
    .setPlaceholder(`Choose a ${key} channel…`)
    .addOptions(
      resolvedGuild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText)
        .sort((a, b) => a.position - b.position)
        .first(25)
        .map((c) => new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setValue(c.id)
          .setDescription(`#${c.name} · ${c.id}`))
    );

  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Build a modal for free-text settings (also used for serverProfile JSON).
 *
 * @param {string} customId
 * @param {string} title
 * @param {SettingDescriptor} setting
 * @param {unknown} current
 * @returns {import('discord.js').ModalBuilder}
 */
function buildTextModal(customId, title, setting, current) {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(setting.label.slice(0, 45))
    .setRequired(true)
    .setStyle(TextInputStyle.Paragraph);

  if (typeof setting.maxLength === 'number') input.setMaxLength(setting.maxLength);
  if (typeof setting.minLength === 'number') input.setMinLength(setting.minLength);
  if (current !== undefined && current !== null) {
    input.setValue(toSingleLine(current));
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(/** @type {any} */ (new ActionRowBuilder().addComponents(input)));
}

/**
 * Build a button toggle row for a boolean setting.
 *
 * @param {string} category
 * @param {string} key
 * @param {boolean} current
 * @param {string} token
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildToggleRow(category, key, current, token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setup:toggle:${enc(category)}:${token}`)
      .setLabel(`Toggle ${key}`)
      .setStyle(current ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('🔁')
  );
}

/**
 * Dispatch a "select a setting" interaction.
 *
 * @param {import('discord.js').SelectMenuInteraction} interaction
 * @param {Record<string, unknown>} settings
 * @param {string} category
 * @param {string} token
 * @returns {Promise<void>}
 */
async function handleCategorySelect(interaction, settings, category, token) {
  const cat = dec(category);
  if (!SETTINGS[cat]) {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Unknown category').setDescription('That category does not exist.')],
      components: [],
    });
    return;
  }

  const { embed, components } = renderCategory(interaction.guild, settings, cat, token);
  await interaction.update({ embeds: [embed], components });
}

/**
 * Persist a string value for a setting (with validation) and confirm.
 *
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Record<string, unknown>} settings
 * @param {string} category
 * @param {string} key
 * @param {unknown} value
 * @param {string} [labelOverride]
 * @returns {Promise<boolean>} true on success
 */
async function saveString(interaction, settings, category, key, value, labelOverride) {
  const setting = getSetting(category, key);
  const label = labelOverride || (setting && setting.label) || key;

  // Validation
  const str = String(value ?? '');
  if (key === 'prefix') {
    if (!str.trim()) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Invalid value').setDescription('Prefix cannot be empty.')],
        components: [],
      });
      return false;
    }
    if (str.length > 5) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Invalid value').setDescription('Prefix must be 5 characters or fewer.')],
        components: [],
      });
      return false;
    }
  }

  if (key === 'serverProfile') {
    try {
      JSON.parse(str);
    } catch {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Invalid value').setDescription('serverProfile must be valid JSON.')],
        components: [],
      });
      return false;
    }
  }

  settingsManager.set(interaction.guildId, key, value);

  // Sync multi-value keys to the typed managers the dashboard uses.
  if (key === 'welcomeChannel' || key === 'welcomeMessage' || key === 'welcomeEnabled') {
    /**
     * @type {import('../../utils/welcomeMessageManager') | undefined}
     */
    const welcomeManager = /** @type {any} */ (interaction.client)?.welcomeMessageManager;
    const guildId = /** @type {string} */ (interaction.guildId);
    const existing = /** @type {Record<string, unknown>} */ (
      welcomeManager ? welcomeManager.getWelcomeConfig(guildId) : {}
    );
    const normalized = normalizeValues(settingsManager.get(guildId));
    welcomeManager?.setWelcomeConfig(guildId, {
      enabled:
        key === 'welcomeEnabled'
          ? Boolean(value)
          : existing.enabled !== undefined
            ? existing.enabled
            : normalized.welcomeEnabled !== undefined
              ? Boolean(normalized.welcomeEnabled)
              : true,
      channelId:
        key === 'welcomeChannel'
          ? String(value ?? '')
          : String(existing.channelId || normalized.welcomeChannel || '') || null,
      title: String(existing.title ?? ''),
      description:
        key === 'welcomeMessage'
          ? String(value)
          : String(existing.description || normalized.welcomeMessage || 'Welcome {USER}, enjoy your stay!'),
      color: existing.color || '#0099ff',
      includeAvatar: existing.includeAvatar !== undefined ? existing.includeAvatar : true,
      includeCount: existing.includeCount !== undefined ? existing.includeCount : true,
      dm: existing.dm !== undefined ? existing.dm : false,
      dmMessage: existing.dmMessage,
    });
  } else if (key === 'loggingChannel') {
    await loggingManager.setLoggingChannel(interaction.guildId, String(value));
  } else if (key === 'modLogChannel') {
    await moderationManager.setModLogChannel(interaction.guildId, String(value));
  } else if (key === 'prefix') {
    settingsManager.setPrefixes(interaction.guildId, [String(value)]);
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('Setting updated')
      .setDescription(`**${label}** set to:\n${formatValue(value)}`)],
    components: [],
  });
  return true;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure this server from inside Discord.')
    // Administrator permission (0x8). setDefaultMemberPermissions takes a bigint
    // bitfield — passing the string '0x8' throws at load; use the bigint value.
    .setDefaultMemberPermissions(0x8n)
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Show the current server configuration.'))
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Open the interactive configuration flow.'))
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Restore all settings to defaults (confirm in Discord).')),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('discord.js').Client} client
   * @returns {Promise<void>}
   */
  async execute(interaction, client) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Guild only').setDescription('This command can only be used inside a server.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = /** @type {import('discord.js').GuildMember | null} */ (interaction.member);
    if (!member || !member.permissions.has('ManageGuild')) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('No permission').setDescription('You need the **Manage Server** permission to use this command.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = /** @type {any} */ (interaction).options.getSubcommand();
    const settings = settingsManager.get(interaction.guildId);
    const token = Math.random().toString(36).slice(2, 10); // per-invocation actor token

    if (subcommand === 'view') {
      const { embed, totalPages } = buildViewEmbed(interaction.guild, settings, 0);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:pagination:${token}:prev`).setLabel('‹ Prev').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
        new ButtonBuilder().setCustomId(`setup:pagination:${token}:next`).setLabel('Next ›').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
        new ButtonBuilder().setCustomId(`setup:view-done:${token}`).setLabel('Close').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: /** @type {any} */ ([row]), flags: MessageFlags.Ephemeral });

      // Pagination handler
      try {
        // @ts-expect-error — component interaction filter callback typing is loose in discord.js v14
        const filter = (i) => {
          if (i.customId !== `setup:pagination:${token}:prev` && i.customId !== `setup:pagination:${token}:next`) return false;
          return i.user.id === interaction.user.id;
        };
        // Reuse the original message id for editing via followUp
        let page = 0;
        // Use a small recursive loop; collect updated interactions.
        // (Kept inline — see the while loop below.)
        // (We need the message to edit; use the reply's message)
        const message = await interaction.fetchReply();
        while (true) {
          // Wait for next interaction
          const collected = await Promise.race([
            /** @type {any} */ (interaction.channel).awaitMessageComponent({
              filter,
              time: COMPONENT_TIMEOUT,
              componentType: 2, // Button
            }),
            new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
          ]);
          if (!collected) break;
          const dir = collected.customId.endsWith(':next') ? 1 : -1;
          const nextPage = page + dir;
          const { embed: newEmbed, totalPages: tp, page: actualPage } = buildViewEmbed(interaction.guild, settings, nextPage);
          page = actualPage;
          await collected.update({
            embeds: [newEmbed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`setup:pagination:${token}:prev`).setLabel('‹ Prev').setStyle(ButtonStyle.Secondary).setDisabled(tp <= 1 || actualPage === 0),
                new ButtonBuilder().setCustomId(`setup:pagination:${token}:next`).setLabel('Next ›').setStyle(ButtonStyle.Secondary).setDisabled(tp <= 1 || actualPage === tp - 1),
                new ButtonBuilder().setCustomId(`setup:view-done:${token}`).setLabel('Close').setStyle(ButtonStyle.Danger)
              ),
            ],
          });
        }
      } catch {
        // timeout / no further interaction — ignore
      }
      return;
    }

    if (subcommand === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:reset-confirm:${token}`).setLabel('Yes, reset everything').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`setup:reset-cancel:${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Reset server configuration?').setDescription('This restores **all** settings to their defaults. This cannot be undone.')],
        components: /** @type {any} */ ([row]),
        flags: MessageFlags.Ephemeral,
      });

      try {
        const confirm = await /** @type {any} */ (interaction.channel).awaitMessageComponent({
          filter: (/** @type {any} */ i) => (i.customId === `setup:reset-confirm:${token}` || i.customId === `setup:reset-cancel:${token}`) && i.user.id === interaction.user.id,
          time: COMPONENT_TIMEOUT,
        });
        if (confirm.customId.startsWith('setup:reset-confirm')) {
          settingsManager.reset(interaction.guildId);
          await confirm.update({
            embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Configuration reset').setDescription('All settings restored to defaults.')],
            components: [],
          });
        } else {
          await confirm.update({
            embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Reset cancelled').setDescription('No changes were made.')],
            components: [],
          });
        }
      } catch {
        // timeout
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Reset cancelled').setDescription('Timed out — no changes were made.')],
          components: [],
        });
      }
      return;
    }

    // ------------------------------------------------------------------
    // /setup config — interactive flow
    // ------------------------------------------------------------------
    const { embed: pickerEmbed } = buildViewEmbed(interaction.guild, settings, 0);
    const pickerEmbed2 = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle('⚙️ Server setup')
      .setDescription('Choose a category to configure. Select a category below.\n\nUse `/setup view` to see the full current config.');

    await interaction.reply({
      embeds: [pickerEmbed2],
      components: /** @type {any} */ ([buildCategoryPicker(interaction.guild, settings)]),
      flags: MessageFlags.Ephemeral,
    });

    try {
      const select = await /** @type {any} */ (interaction.channel).awaitMessageComponent({
        filter: (/** @type {any} */ i) => i.customId === 'setup:select:__category__:token' && i.user.id === interaction.user.id,
        time: COMPONENT_TIMEOUT,
      });

      const category = String(/** @type {any} */ (select).values[0]);
      const { embed: catEmbed, components: catComponents } = renderCategory(interaction.guild, settings, category, token);

      await select.update({ embeds: [catEmbed], components: catComponents });

      // Now wait for per-setting actions.
      await handleCategoryActions(interaction, settings, category, token, client);
    } catch (err) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Setup closed').setDescription('Setup timed out or was closed. Run `/setup config` again to continue.')],
        components: [],
      }).catch(() => {});
    }
  },
};

/**
 * Drive the per-category action loop (buttons, toggles, channel picks).
 *
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Record<string, unknown>} settings
 * @param {string} category
 * @param {string} token
 * @param {import('discord.js').Client} client
 * @returns {Promise<void>}
 */
async function handleCategoryActions(interaction, settings, category, token, client) {
  const cat = dec(category);
  const list = SETTINGS[cat] || [];

  while (true) {
    const collected = await Promise.race([
      /** @type {any} */ (interaction.channel).awaitMessageComponent({
        filter: (/** @type {any} */ i) => i.customId.startsWith(`setup:`) && i.user.id === interaction.user.id,
        time: COMPONENT_TIMEOUT,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
    ]);

    if (!collected) break; // timeout

    const { customId } = collected;
    const parts = customId.split(':');

    // done
    if (parts[1] === 'done') {
      await collected.update({
        embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Setup complete').setDescription('Your configuration has been saved.')],
        components: [],
      });
      return;
    }

    // back
    if (parts[1] === 'back') {
      await collected.update({
        embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle('⚙️ Server setup').setDescription('Choose a category below.')],
        components: [buildCategoryPicker(interaction.guild, settings)],
      });
      continue;
    }

    // reset-confirm / reset-cancel
    if (parts[1] === 'reset-confirm' || parts[1] === 'reset-cancel') {
      if (parts[1] === 'reset-confirm') {
        settingsManager.reset(interaction.guildId);
        await collected.update({
          embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Configuration reset').setDescription('All settings restored to defaults.')],
          components: [],
        });
      } else {
        await collected.update({
          embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Reset cancelled').setDescription('No changes were made.')],
          components: [],
        });
      }
      return;
    }

    // toggle
    if (parts[1] === 'toggle') {
      const key = parts[2]; // category is parts[2]? no — scheme: setup:toggle:{category}:{token}
      // Actually scheme is setup:{kind}:{category}:{token}; for toggle kind,
      // we know which setting from key mapping — but toggles are keyed by
      // customId that includes the category only. We stored token at parts[3].
      // Re-derive: find the boolean setting for this category.
      const boolSetting = list.find((s) => s.kind === 'toggle');
      if (!boolSetting) {
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Toggle setting not found.')], components: [] });
        return;
      }
      const current = Boolean(getValue(settings, boolSetting.key));
      const next = !current;
      settings[boolSetting.key] = next;
      await saveString(collected, settings, cat, boolSetting.key, next);
      // Re-render the category
      const { embed: e2, components: c2 } = renderCategory(interaction.guild, settings, cat, token);
      await collected.editReply({ embeds: [e2], components: c2 }).catch(() => {});
      continue;
    }

    // channel
    if (parts[1] === 'channel') {
      // Show channel picker for the setting that owns this category's channel key
      const channelSetting = list.find((s) => s.kind === 'channel');
      if (!channelSetting) {
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Channel setting not found.')], components: [] });
        return;
      }
      const pickerRow = buildChannelPicker(interaction.guild, cat, channelSetting.key, token);
      await collected.update({
        embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle(`Select ${channelSetting.label}`).setDescription('Pick a text channel from the dropdown.')],
        components: [pickerRow],
      });
      continue;
    }

    // channel pick (StringSelectMenu)
    if (parts[1] === 'pick') {
      const channelSetting = list.find((s) => s.kind === 'channel');
      if (!channelSetting) {
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Channel setting not found.')], components: [] });
        return;
      }
      const channelId = String(collected.values[0]);
      settings[channelSetting.key] = channelId;
      await saveString(collected, settings, cat, channelSetting.key, channelId);
      // Re-render
      const { embed: e3, components: c3 } = renderCategory(interaction.guild, settings, cat, token);
      await collected.editReply({ embeds: [e3], components: c3 }).catch(() => {});
      continue;
    }

    // modal
    if (parts[1] === 'modal') {
      const setting = list.find((s) => s.kind === 'modal-multi' || s.kind === 'string');
      if (!setting) {
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Setting not found.')], components: [] });
        return;
      }
      const modal = buildTextModal(
        `setup:modal-submit:${enc(cat)}:${token}`,
        `Edit ${setting.label}`,
        setting,
        getValue(settings, setting.key)
      );
      await collected.showModal(modal);
      continue;
    }

    // modal-submit
    if (parts[1] === 'modal-submit') {
      const value = collected.fields.getTextInputValue('value');
      const setting = list.find((s) => s.kind === 'modal-multi' || s.kind === 'string');
      if (!setting) {
        await collected.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Setting not found.')], components: [], flags: MessageFlags.Ephemeral });
        return;
      }
      const ok = await saveString(collected, settings, cat, setting.key, value);
      if (!ok) continue;
      const { embed: e4, components: c4 } = renderCategory(interaction.guild, settings, cat, token);
      await collected.editReply({ embeds: [e4], components: c4 }).catch(() => {});
      continue;
    }

    // modal-cancel
    if (parts[1] === 'modal-cancel') {
      await collected.update({
        embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Cancelled').setDescription('No changes made.')],
        components: [],
      });
      return;
    }
  }
}
