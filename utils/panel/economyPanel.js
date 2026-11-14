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
        .setCustomId(`econ:refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`econ:back:${token}`)
        .setLabel('Dashboard')
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
  runEconomyPanel,
};
