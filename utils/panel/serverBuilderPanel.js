// @ts-check
/**
 * Server builder panel for /dashboard.
 *
 * Creates categories, text channels and roles without leaving Discord. Once a
 * resource exists, Discord's own channel/role settings are the better editor,
 * so this panel deliberately only handles creation.
 *
 * CustomIds: `build:*:{token}`.
 */

const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const engine = require('./settingsEngine');
const { awaitComponentSafe, awaitModalSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;

/**
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').GuildMember | null}
 */
function botMember(guild) {
  return /** @type {any} */ (guild.members?.me || null);
}

/**
 * @param {import('discord.js').Guild} guild
 * @returns {boolean}
 */
function canManageChannels(guild) {
  const member = botMember(guild);
  if (!member) return false;
  return Boolean(member.permissions?.has(PermissionFlagsBits.ManageChannels));
}

/**
 * @param {import('discord.js').Guild} guild
 * @returns {boolean}
 */
function canManageRoles(guild) {
  const member = botMember(guild);
  if (!member) return false;
  return Boolean(member.permissions?.has(PermissionFlagsBits.ManageRoles));
}

/**
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildMainEmbed(guild) {
  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const roles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).size;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: 'Server builder', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('🏗️ Server builder')
    .setDescription(
      [
        'Create the scaffolding for a new area in a couple of clicks.',
        '',
        '_Renaming, moving and permissions stay in Discord’s native channel settings._',
      ].join('\n')
    )
    .addFields(
      { name: '📁 Categories', value: String(categories), inline: true },
      { name: '💬 Text channels', value: String(textChannels), inline: true },
      { name: '🏷️ Roles', value: String(roles), inline: true },
      {
        name: '🔑 Bot permissions',
        value: [
          canManageChannels(guild) ? '✅ Manage Channels' : '❌ Manage Channels',
          canManageRoles(guild) ? '✅ Manage Roles' : '❌ Manage Roles',
        ].join('\n'),
        inline: false,
      }
    )
    .setFooter({ text: 'New resources are created immediately' })
    .setTimestamp();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} token
 * @returns {any[]}
 */
function buildMainRows(guild, token) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`build:category:${token}`)
        .setLabel('New category')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📁')
        .setDisabled(!canManageChannels(guild)),
      new ButtonBuilder()
        .setCustomId(`build:channel:${token}`)
        .setLabel('New channel')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💬')
        .setDisabled(!canManageChannels(guild)),
      new ButtonBuilder()
        .setCustomId(`build:role:${token}`)
        .setLabel('New role')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏷️')
        .setDisabled(!canManageRoles(guild)),
      new ButtonBuilder()
        .setCustomId(`build:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {'category' | 'channel' | 'role'} kind
 * @param {string} token
 * @returns {ModalBuilder}
 */
function buildCreateModal(kind, token) {
  const titles = { category: 'New category', channel: 'New text channel', role: 'New role' };
  const labels = { category: 'Category name', channel: 'Channel name', role: 'Role name' };
  const hints = {
    category: 'e.g. Events',
    channel: 'e.g. event-chat',
    role: 'e.g. Event Ping',
  };

  const inputs = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel(labels[kind])
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder(hints[kind])
    ),
  ];

  if (kind === 'role') {
    inputs.push(
      /** @type {any} */ (
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Colour (hex, optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(7)
            .setPlaceholder('#5865f2')
        )
      )
    );
  }

  const modal = new ModalBuilder()
    .setCustomId(`build:create:${kind}:${token}`)
    .setTitle(titles[kind]);
  modal.addComponents(/** @type {any} */ (inputs));
  return modal;
}

/**
 * Channels want hyphens, categories and roles read better with spaces.
 *
 * @param {string} raw
 * @param {'category' | 'channel' | 'role'} [kind]
 * @returns {string}
 */
function sanitizeName(raw, kind = 'channel') {
  const trimmed = String(raw || '')
    .trim()
    .replace(/\s+/g, kind === 'channel' ? '-' : ' ')
    .slice(0, 100);
  return trimmed;
}

/**
 * @param {string} raw
 * @returns {number | null}
 */
function parseColor(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  if (/^[0-9a-f]{6}$/i.test(value)) return parseInt(value, 16);
  return null;
}

/**
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runServerBuilderPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;

  await firstUpdate
    .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
    .catch(() => {});

  while (true) {
    const collected = await awaitComponentSafe(
      interaction,
      (/** @type {any} */ i) => String(i.customId).startsWith('build:') && i.user.id === userId,
      TIMEOUT
    );
    if (!collected) return 'timeout';

    const id = String(collected.customId);

    if (id === `build:back:${token}`) return 'back';

    if (id === `build:category:${token}` || id === `build:role:${token}`) {
      const kind = id.startsWith('build:category:') ? 'category' : 'role';
      const modalId = `build:create:${kind}:${token}`;
      await collected.showModal(buildCreateModal(kind, token)).catch(() => {});
      const submit = await awaitModalSafe(
        collected,
        (/** @type {any} */ i) => i.customId === modalId && i.user.id === userId,
        TIMEOUT
      );
      if (!submit) return 'timeout';

      const name = sanitizeName(submit.fields.getTextInputValue('name'), kind);
      if (!name) {
        await submit
          .reply({ content: '❌ A name is required.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
        continue;
      }

      try {
        if (kind === 'category') {
          await guild.channels.create({ name, type: ChannelType.GuildCategory });
        } else {
          const color = parseColor(submit.fields.getTextInputValue('color') || '');
          await guild.roles.create({
            name,
            color: color ?? undefined,
            reason: 'Dashboard builder',
          });
        }
        await submit
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle(kind === 'category' ? '📁 Category created' : '🏷️ Role created')
                .setDescription(`**${name}** is ready to use.`),
            ],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      } catch (error) {
        await submit
          .reply({
            content: `❌ Could not create ${kind}: ${/** @type {any} */ (error)?.message || error}`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

      await interaction
        .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(guild, token) })
        .catch(() => {});
      continue;
    }

    if (id === `build:channel:${token}`) {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`build:parent:${token}`)
          .setPlaceholder('Category for the new channel')
          .setChannelTypes([ChannelType.GuildCategory])
          .setMinValues(0)
          .setMaxValues(1)
      );

      await collected
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('💬 New channel')
              .setDescription('Pick the category it belongs to, or skip to create it at the top.'),
          ],
          components: [picker],
        })
        .catch(() => {});

      const picked = await awaitComponentSafe(
        interaction,
        (/** @type {any} */ i) =>
          String(i.customId).startsWith('build:parent:') && i.user.id === userId,
        TIMEOUT
      );
      if (!picked) return 'timeout';

      const parentId = String(picked.values?.[0] || '') || null;
      const modalId = `build:create:channel:${token}`;
      await picked.showModal(buildCreateModal('channel', token)).catch(() => {});
      const submit = await awaitModalSafe(
        picked,
        (/** @type {any} */ i) => i.customId === modalId && i.user.id === userId,
        TIMEOUT
      );
      if (!submit) return 'timeout';

      const name = sanitizeName(submit.fields.getTextInputValue('name'), 'channel');
      if (!name) {
        await submit
          .reply({ content: '❌ A name is required.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
        continue;
      }

      try {
        await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: parentId || undefined,
        });
        await submit
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('💬 Channel created')
                .setDescription(
                  `**#${name}**${parentId ? ` inside <#${parentId}>` : ''} is ready.`
                ),
            ],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      } catch (error) {
        await submit
          .reply({
            content: `❌ Could not create the channel: ${/** @type {any} */ (error)?.message || error}`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

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
  buildCreateModal,
  parseColor,
  sanitizeName,
  runServerBuilderPanel,
};
