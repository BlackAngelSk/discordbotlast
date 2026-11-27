const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  getHumbleBundles,
  buildBundleCard,
  paginate,
  BUNDLE_TYPES,
} = require('../../utils/bundles/humbleBundle');

const PER_PAGE = 5;
const COLLECTOR_MS = 5 * 60 * 1000;
const SOON_MS = 24 * 60 * 60 * 1000;

const TYPE_META = {
  games: { label: 'Games', emoji: '🎮', color: 0xcc2929 },
  books: { label: 'Books & Comics', emoji: '📚', color: 0x1f6feb },
  software: { label: 'Software', emoji: '💻', color: 0x2ea043 },
  all: { label: 'All bundles', emoji: '🎁', color: 0xcc2929 },
};

/**
 * Admins get fresh data every time they run the command; everyone else is served
 * the cache. An explicit `refresh` argument forces it for anyone.
 */
function shouldForceRefresh(message, explicitRefresh = false) {
  if (explicitRefresh) return true;

  const permissions = message?.member?.permissions;
  if (!permissions || typeof permissions.has !== 'function') return false;

  return (
    permissions.has(PermissionFlagsBits.ManageGuild) ||
    permissions.has(PermissionFlagsBits.Administrator)
  );
}

function typeKey(types) {
  return types.length === BUNDLE_TYPES.length ? 'all' : types[0] || 'games';
}

function buildNavRow(state, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('hb:page:prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page <= 0),
    new ButtonBuilder()
      .setCustomId('hb:page:label')
      .setLabel(`${state.page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('hb:page:next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('hb:refresh')
      .setEmoji('🔄')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildTypeRow(activeKey) {
  return new ActionRowBuilder().addComponents(
    ...BUNDLE_TYPES.map((type) =>
      new ButtonBuilder()
        .setCustomId(`hb:type:${type}`)
        .setLabel(TYPE_META[type].label)
        .setEmoji(TYPE_META[type].emoji)
        .setStyle(type === activeKey ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ButtonBuilder()
      .setCustomId('hb:type:all')
      .setLabel('All')
      .setEmoji('🎁')
      .setStyle(activeKey === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
}

function render(state) {
  const activeKey = typeKey(state.types);
  const meta = TYPE_META[activeKey];
  const bundles = state.result?.bundles || [];
  const pages = paginate(bundles, PER_PAGE);
  const totalPages = pages.length;

  state.page = Math.min(Math.max(0, state.page), totalPages - 1);

  const pageItems = pages[state.page] || [];
  const soon = bundles.filter(
    (bundle) => typeof bundle.remainingMs === 'number' && bundle.remainingMs <= SOON_MS
  );
  const fetchedUnix = state.result
    ? Math.floor(new Date(state.result.fetchedAt).getTime() / 1000)
    : null;

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setAuthor({ name: 'Humble Bundle', iconURL: 'https://www.humblebundle.com/favicon.ico' })
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setURL('https://www.humblebundle.com/bundles')
    .setDescription(
      `**${bundles.length}** active` +
        (soon.length > 0 ? ` · ⏰ **${soon.length}** ending <24h` : '')
    )
    .setFooter({
      text:
        `Page ${state.page + 1} of ${totalPages} · soonest first · ` +
        `${state.force ? 'refreshed now' : 'cached 30 min'} · buttons expire in 5 min`,
    })
    .setTimestamp(state.result ? new Date(state.result.fetchedAt) : new Date());

  if (pageItems[0]?.image) {
    embed.setThumbnail(pageItems[0].image);
  }

  if (pageItems.length === 0) {
    embed.setDescription('📭 No active bundles in this category right now.');
  }

  for (let index = 0; index < pageItems.length; index += 1) {
    embed.addFields(
      buildBundleCard(pageItems[index], state.page * PER_PAGE + index, { soonMs: SOON_MS })
    );
  }

  if (state.result?.failed?.length) {
    embed.addFields({
      name: '⚠️ Unavailable',
      value: state.result.failed
        .slice(0, 3)
        .map((entry) => `• ${String(entry).slice(0, 90)}`)
        .join('\n'),
    });
  }

  return {
    embeds: [embed],
    components: [buildNavRow(state, totalPages), buildTypeRow(activeKey)],
  };
}

async function loadBundles(state, types, force = false) {
  state.types = types;
  state.force = force;
  state.result = await getHumbleBundles({ types, force });
  return state.result;
}

module.exports = {
  name: 'humblebundle',
  description: 'Browse active Humble Bundles with time left, one page at a time',
  usage:
    '!humblebundle [games|books|software|all] [refresh]\n' +
    'Examples: `!humblebundle`, `!humblebundle books`, `!humblebundle all refresh`',
  aliases: ['humble', 'hb', 'bundles'],
  category: 'utility',
  shouldForceRefresh,

  async execute(message, args) {
    const rawArgs = (args || []).map((arg) => String(arg || '').toLowerCase());
    const refresh = rawArgs.includes('refresh') || rawArgs.includes('--refresh');
    const typeArg = rawArgs.find((arg) => !arg.startsWith('-') && arg !== 'refresh');

    let types = ['games'];

    if (typeArg === 'all') {
      types = [...BUNDLE_TYPES];
    } else if (BUNDLE_TYPES.includes(typeArg)) {
      types = [typeArg];
    } else if (typeArg) {
      return message.reply(
        `❌ Unknown bundle type \`${typeArg}\`. Use \`games\`, \`books\`, \`software\` or \`all\`.`
      );
    }

    const autoRefresh = shouldForceRefresh(message, false);
    const force = refresh || autoRefresh;
    const state = { types, page: 0, result: null, force: false, autoRefresh };

    let statusMessage = null;
    if (force) {
      statusMessage = await message.reply('🔄 Updating Humble Bundle data…');
    }

    try {
      await loadBundles(state, types, force);
    } catch (error) {
      const content = `❌ Could not load Humble Bundles: ${error.message || error}`;
      return statusMessage ? statusMessage.edit(content) : message.reply(content);
    }

    const reply = statusMessage
      ? await statusMessage.edit(render(state))
      : await message.reply(render(state));
    const collector = reply.createMessageComponentCollector({
      filter: (interaction) => interaction.customId.startsWith('hb:'),
      time: COLLECTOR_MS,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: '❌ These buttons belong to whoever ran the command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const [, action, value] = interaction.customId.split(':');

      try {
        if (action === 'page') {
          if (value === 'prev') state.page -= 1;
          if (value === 'next') state.page += 1;

          return interaction.update(render(state));
        }

        if (action === 'type') {
          await interaction.deferUpdate();

          const nextTypes = value === 'all' ? [...BUNDLE_TYPES] : [value];
          try {
            // Admins keep getting fresh data when they switch category too.
            await loadBundles(state, nextTypes, state.autoRefresh);
            state.page = 0;
          } catch (error) {
            return interaction.followUp({
              content: `❌ Could not load ${value} bundles: ${error.message || error}`,
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.editReply(render(state));
        }

        if (action === 'refresh') {
          await interaction.deferUpdate();
          try {
            await loadBundles(state, state.types, true);
            state.page = 0;
          } catch (error) {
            return interaction.followUp({
              content: `❌ Refresh failed: ${error.message || error}`,
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.editReply(render(state));
        }
      } catch (error) {
        console.error('[humblebundle] interaction failed:', error.message || error);
      }

      return undefined;
    });

    collector.on('end', async () => {
      const final = render(state);
      final.components.forEach((row) =>
        row.components.forEach((button) => button.setDisabled(true))
      );

      await reply.edit(final).catch(() => {});
    });

    return reply;
  },
};
