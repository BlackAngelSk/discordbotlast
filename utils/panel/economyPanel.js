// @ts-check
/**
 * Economy panel for /dashboard.
 *
 * Shows the balance leaderboard, exposes the season-leaderboard settings
 * (delegated to the `season` settings category) and lets an admin give or take
 * coins from a member with a user picker + amount modal.
 *
 * CustomIds: `econ:*:{token}` so the hub loop (dashboard:*) and the settings
 * engine (setup:*) never collide.
 */

const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const economyManager = require('../economyManager');
const seasonLeaderboardManager = require('../seasonLeaderboardManager');
const engine = require('./settingsEngine');
const { awaitComponentSafe, awaitModalSafe } = require('./componentAwait');

const TIMEOUT = engine.COMPONENT_TIMEOUT;
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

/**
 * @param {number} value
 * @returns {string}
 */
function formatCoins(value) {
  return Number(value || 0).toLocaleString('en-US');
}

/**
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildShopEmbed(guild) {
  const items = economyManager.getShopItems(String(guild.id)) || [];
  const lines = items
    .slice(0, 20)
    .map(
      (item) =>
        `• **${item.name}** — ${formatCoins(item.price)} coins · \`${item.type || 'item'}\` · id \`${item.id}\``
    );

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: 'Economy', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('🛍️ Shop items')
    .setDescription(lines.length ? lines.join('\n').slice(0, 4000) : '*No shop items yet.*')
    .setFooter({ text: `${items.length} item(s) · /shop sells these` })
    .setTimestamp();
}

/**
 * @param {string} token
 * @returns {any[]}
 */
function buildShopRows(token) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`econ:shopadd:${token}`)
        .setLabel('Add item')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId(`econ:shopremove:${token}`)
        .setLabel('Remove item')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`econ:shopback:${token}`)
        .setLabel('Back to economy')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {string} token
 * @returns {ModalBuilder}
 */
function buildShopItemModal(token) {
  const field = (
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {string} */ placeholder,
    style
  ) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(id !== 'description')
      .setMaxLength(id === 'description' ? 200 : 60)
      .setPlaceholder(placeholder.slice(0, 100));
    return /** @type {any} */ (new ActionRowBuilder().addComponents(input));
  };

  return new ModalBuilder()
    .setCustomId(`econ:shopcreate:${token}`)
    .setTitle('Add shop item')
    .addComponents(
      field('name', 'Item name', 'VIP Role', TextInputStyle.Short),
      field('price', 'Price (coins)', '10000', TextInputStyle.Short),
      field('itemId', 'Item ID', 'vip_role', TextInputStyle.Short),
      field('type', 'Type (role / badge / item)', 'role', TextInputStyle.Short),
      field(
        'description',
        'Description (optional)',
        'What the buyer gets…',
        TextInputStyle.Paragraph
      )
    );
}

/**
 * @param {any[]} items
 * @param {string} token
 * @returns {any}
 */
function buildShopItemSelect(items, token) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`econ:shopdelete:${token}`)
      .setPlaceholder('Choose an item to remove…')
      .addOptions(
        items.slice(0, 25).map((item) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(String(item.name || item.id).slice(0, 100))
            .setDescription(
              `${formatCoins(item.price)} coins · ${item.type || 'item'}`.slice(0, 100)
            )
            .setValue(String(item.id).slice(0, 100))
        )
      )
  );
}

/**
 * @param {import('discord.js').Guild} guild
 * @returns {EmbedBuilder}
 */
function buildMainEmbed(guild) {
  const guildId = String(guild.id);
  const top = economyManager.getLeaderboard(guildId, 'balance', 5);
  const season = seasonLeaderboardManager.getGuildConfig(guildId);

  const board = top.length
    ? top
        .map(
          (user, index) =>
            `${MEDALS[index] || `**${index + 1}.**`} <@${user.userId}> — **${formatCoins(
              user.balance
            )}** coins`
        )
        .join('\n')
    : '*No balances yet — /daily is a good nudge.*';

  const seasonValue = season.enabled
    ? season.channelId
      ? `Enabled in <#${season.channelId}>`
      : 'Enabled · no channel set'
    : 'Disabled';

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: 'Economy', iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTitle('💰 Economy')
    .setDescription(board)
    .addFields(
      { name: '🏆 Season board', value: seasonValue, inline: true },
      { name: '⏱️ Refresh', value: `${season.updateIntervalMinutes} min`, inline: true },
      { name: '📐 Mode', value: season.compactMode ? 'Compact' : 'Full', inline: true }
    )
    .setFooter({ text: 'Adjust balances or tune the season leaderboard' })
    .setTimestamp();
}

/**
 * @param {string} token
 * @returns {any[]}
 */
function buildMainRows(token) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`econ:give:${token}`)
        .setLabel('Give coins')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰'),
      new ButtonBuilder()
        .setCustomId(`econ:take:${token}`)
        .setLabel('Take coins')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('💸'),
      new ButtonBuilder()
        .setCustomId(`econ:season:${token}`)
        .setLabel('Season settings')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏆'),
      new ButtonBuilder()
        .setCustomId(`econ:shop:${token}`)
        .setLabel('Shop items')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛍️')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`econ:refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`econ:global:${token}`)
        .setLabel('Global board')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🌍'),
      new ButtonBuilder()
        .setCustomId(`econ:back:${token}`)
        .setLabel('Dashboard')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @returns {EmbedBuilder}
 */
function buildGlobalEmbed() {
  const top = economyManager.getGlobalLeaderboard('balance', 10);
  const board = top.length
    ? top
        .map(
          (user, index) =>
            `${MEDALS[index] || `**${index + 1}.**`} <@${user.userId}> — **${formatCoins(
              user.balance
            )}** coins`
        )
        .join('\n')
    : '*No balances yet.*';

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🌍 Global leaderboard')
    .setDescription(board)
    .setFooter({ text: 'Every server the bot is in' })
    .setTimestamp();
}

/**
 * @param {string} token
 * @returns {any[]}
 */
function buildGlobalRows(token) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`econ:globalrefresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`econ:globalback:${token}`)
        .setLabel('Back to economy')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('↩️')
    ),
  ];
}

/**
 * @param {'give' | 'take'} mode
 * @param {string} token
 * @returns {{ embeds: EmbedBuilder[], components: any[] }}
 */
function buildUserPicker(mode, token) {
  const picker = new UserSelectMenuBuilder()
    .setCustomId(`econ:user:${mode}:${token}`)
    .setPlaceholder(mode === 'give' ? 'Who gets the coins?' : 'Who loses the coins?')
    .setMinValues(1)
    .setMaxValues(1);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(mode === 'give' ? Colors.Green : Colors.Red)
        .setTitle(mode === 'give' ? '💰 Give coins' : '💸 Take coins')
        .setDescription('Pick the member first, then enter the amount.'),
    ],
    components: [new ActionRowBuilder().addComponents(picker)],
  };
}

/**
 * @param {'give' | 'take'} mode
 * @param {string} token
 * @returns {ModalBuilder}
 */
function buildAmountModal(mode, token) {
  return new ModalBuilder()
    .setCustomId(`econ:amount:${mode}:${token}`)
    .setTitle(mode === 'give' ? 'Give coins' : 'Take coins')
    .addComponents(
      /** @type {any} */ (
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(12)
            .setPlaceholder('e.g. 500')
        )
      )
    );
}

/**
 * @param {any} interaction
 * @param {string} userId
 * @param {number} [time]
 * @returns {Promise<any | null>}
 */
async function awaitEconComponent(interaction, userId, time = TIMEOUT) {
  return awaitComponentSafe(
    interaction,
    (/** @type {any} */ i) => String(i.customId).startsWith('econ:') && i.user.id === userId,
    time
  );
}

/**
 * @param {any} opener the interaction that showed the modal
 * @param {string} customId
 * @param {string} userId
 * @returns {Promise<any | null>}
 */
async function awaitAmountModal(opener, customId, userId) {
  return awaitModalSafe(
    opener,
    (/** @type {any} */ i) => i.customId === customId && i.user.id === userId,
    TIMEOUT
  );
}

/**
 * Run the economy panel loop until the user goes back or the menu times out.
 *
 * @param {{ interaction: any, guild: import('discord.js').Guild, userId: string, token: string, firstUpdate: any }} ctx
 * @returns {Promise<'back' | 'timeout'>}
 */
async function runEconomyPanel(ctx) {
  const { interaction, guild, userId, token, firstUpdate } = ctx;
  const guildId = String(guild.id);

  if (firstUpdate) {
    await firstUpdate
      .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
      .catch(() => {});
  } else {
    await interaction
      .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
      .catch(() => {});
  }

  while (true) {
    const collected = await awaitEconComponent(interaction, userId);
    if (!collected) return 'timeout';

    const id = String(collected.customId);

    if (id === `econ:back:${token}`) {
      return 'back';
    }

    if (id === `econ:refresh:${token}`) {
      await collected
        .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:season:${token}`) {
      const { embed, components } = engine.renderCategory(guild, 'season', token);
      await collected.update({ embeds: [embed], components }).catch(() => {});
      await engine.categoryLoop(interaction, 'season', token, { skipBackRender: true });
      await interaction
        .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:global:${token}` || id === `econ:globalrefresh:${token}`) {
      await collected
        .update({ embeds: [buildGlobalEmbed()], components: buildGlobalRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:globalback:${token}`) {
      await collected
        .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:shop:${token}`) {
      await collected
        .update({ embeds: [buildShopEmbed(guild)], components: buildShopRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:shopback:${token}`) {
      await collected
        .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:shopadd:${token}`) {
      const modalId = `econ:shopcreate:${token}`;
      await collected.showModal(buildShopItemModal(token)).catch(() => {});
      const submit = await awaitAmountModal(collected, modalId, userId);
      if (!submit) return 'timeout';

      const name = String(submit.fields.getTextInputValue('name') || '').trim();
      const price = Number(
        String(submit.fields.getTextInputValue('price') || '').replace(/[^\d]/g, '')
      );
      const itemId = String(submit.fields.getTextInputValue('itemId') || '').trim();
      const type = String(submit.fields.getTextInputValue('type') || 'item')
        .trim()
        .toLowerCase();
      const description =
        String(submit.fields.getTextInputValue('description') || '').trim() || 'No description';

      /** @type {string | null} */
      let error = null;
      if (!name) error = 'The item needs a name.';
      else if (!Number.isFinite(price) || price <= 0)
        error = 'The price must be a positive number.';
      else if (!/^[A-Za-z0-9_-]{1,40}$/.test(itemId))
        error = 'The item ID must be 1-40 characters (letters, numbers, - or _).';
      else if (!['role', 'badge', 'item'].includes(type))
        error = 'The type must be `role`, `badge` or `item`.';
      else if (
        (economyManager.getShopItems(guildId) || []).some((item) => String(item.id) === itemId)
      )
        error = `An item with ID \`${itemId}\` already exists.`;

      if (error) {
        await submit
          .reply({ content: `❌ ${error}`, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      } else {
        try {
          await economyManager.addShopItem(guildId, { id: itemId, name, price, type, description });
          await submit
            .reply({
              content: `✅ **${name}** added to the shop for **${formatCoins(price)}** coins (id \`${itemId}\`).`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        } catch (err) {
          await submit
            .reply({
              content: `❌ Could not add the item: ${/** @type {any} */ (err)?.message || err}`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      }

      await interaction
        .editReply({ embeds: [buildShopEmbed(guild)], components: buildShopRows(token) })
        .catch(() => {});
      continue;
    }

    if (id === `econ:shopremove:${token}`) {
      const items = economyManager.getShopItems(guildId) || [];
      if (!items.length) {
        await collected
          .reply({ content: 'No shop items to remove.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
        continue;
      }

      await collected
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('🗑️ Remove a shop item')
              .setDescription('Pick the item to delete. Purchases already made are not refunded.'),
          ],
          components: [
            buildShopItemSelect(items, token),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`econ:shop:${token}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            ),
          ],
        })
        .catch(() => {});
      continue;
    }

    if (id === `econ:shopdelete:${token}`) {
      const itemId = String(collected.values?.[0] || '');
      const items = economyManager.getShopItems(guildId) || [];
      const item = items.find((candidate) => String(candidate.id) === itemId);
      const removed = itemId ? await economyManager.removeShopItem(guildId, itemId) : false;

      await collected
        .update({ embeds: [buildShopEmbed(guild)], components: buildShopRows(token) })
        .catch(() => {});
      await collected
        .followUp({
          content: removed
            ? `✅ Removed **${item?.name || itemId}** from the shop.`
            : '❌ Item not found — it may already be gone.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      continue;
    }

    if (id === `econ:give:${token}` || id === `econ:take:${token}`) {
      const mode = id.startsWith('econ:give:') ? 'give' : 'take';
      const prompt = buildUserPicker(mode, token);
      await collected.update(prompt).catch(() => {});

      const pick = await awaitEconComponent(interaction, userId);
      if (!pick) return 'timeout';
      if (String(pick.customId) === `econ:back:${token}`) {
        await pick
          .update({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
          .catch(() => {});
        continue;
      }
      if (!String(pick.customId).startsWith(`econ:user:${mode}:`)) {
        await pick.deferUpdate().catch(() => {});
        continue;
      }

      const targetId = String(pick.values?.[0] || '');
      if (!targetId) {
        await pick.deferUpdate().catch(() => {});
        continue;
      }

      const modalId = `econ:amount:${mode}:${token}`;
      await pick.showModal(buildAmountModal(mode, token)).catch(() => {});
      const submit = await awaitAmountModal(pick, modalId, userId);
      if (!submit) return 'timeout';

      const raw = String(submit.fields.getTextInputValue('amount') || '').replace(/[^\d]/g, '');
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        await submit
          .reply({
            content: '❌ Enter a positive number.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        await interaction
          .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
          .catch(() => {});
        continue;
      }

      try {
        const newBalance =
          mode === 'give'
            ? await economyManager.addBalance(guildId, targetId, amount)
            : await economyManager.removeBalance(guildId, targetId, amount);

        await submit
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor(mode === 'give' ? Colors.Green : Colors.Red)
                .setTitle(mode === 'give' ? '💰 Coins given' : '💸 Coins removed')
                .setDescription(
                  [
                    `**Member:** <@${targetId}>`,
                    `**Amount:** ${formatCoins(amount)}`,
                    `**New balance:** ${formatCoins(newBalance)}`,
                  ].join('\n')
                ),
            ],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      } catch (error) {
        await submit
          .reply({
            content: `❌ Could not update the balance: ${/** @type {any} */ (error)?.message || error}`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }

      await interaction
        .editReply({ embeds: [buildMainEmbed(guild)], components: buildMainRows(token) })
        .catch(() => {});
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

module.exports = {
  buildMainEmbed,
  buildMainRows,
  buildUserPicker,
  buildAmountModal,
  buildShopEmbed,
  buildShopRows,
  buildShopItemModal,
  buildShopItemSelect,
  buildGlobalEmbed,
  buildGlobalRows,
  runEconomyPanel,
};
