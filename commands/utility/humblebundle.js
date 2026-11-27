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
  buildBundleEmbed,
  paginate,
  BUNDLE_TYPES,
} = require('../../utils/bundles/humbleBundle');
const humbleBundleAlerts = require('../../utils/bundles/humbleBundleAlerts');

const PER_PAGE = 3; // one embed per bundle, three per message
const COLLECTOR_MS = 5 * 60 * 1000;
const SOON_MS = 24 * 60 * 60 * 1000;

const TYPE_META = {
  games: { label: 'Games', emoji: '🎮', color: 0xcc2929 },
  books: { label: 'Books & Comics', emoji: '📚', color: 0x1f6feb },
  software: { label: 'Software', emoji: '💻', color: 0x2ea043 },
  all: { label: 'All bundles', emoji: '🎁', color: 0xcc2929 },
};

const TYPE_LABELS = {
  games: 'Games',
  books: 'Books & Comics',
  software: 'Software',
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

function canManage(message) {
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

function typeLabel(types) {
  return types.map((type) => TYPE_LABELS[type] || type).join(' + ');
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

  const header = [
    `${meta.emoji} **${meta.label}**`,
    `**${bundles.length}** active`,
    soon.length > 0 ? `⏰ **${soon.length}** ending <24h` : null,
    `page ${state.page + 1}/${totalPages}`,
    state.force ? 'refreshed now' : 'cached 30 min',
  ]
    .filter(Boolean)
    .join(' · ');

  const embeds = pageItems.map((bundle, index) =>
    buildBundleEmbed(bundle, { index: state.page * PER_PAGE + index, soonMs: SOON_MS })
  );

  if (embeds.length === 0) {
    embeds.push(
      new EmbedBuilder()
        .setColor(meta.color)
        .setDescription('📭 No active bundles in this category right now.')
    );
  }

  embeds[embeds.length - 1].setFooter({
    text: `Page ${state.page + 1} of ${totalPages} · soonest first · buttons expire in 5 min`,
  });

  if (state.result?.failed?.length) {
    embeds.push(
      new EmbedBuilder().setColor(0xfee75c).setDescription(
        `⚠️ Unavailable: ${state.result.failed
          .slice(0, 3)
          .map((entry) => String(entry).slice(0, 90))
          .join(' · ')}`
      )
    );
  }

  return {
    content: header,
    embeds,
    components: [buildNavRow(state, totalPages), buildTypeRow(activeKey)],
  };
}

async function loadBundles(state, types, force = false) {
  state.types = types;
  state.force = force;
  state.result = await getHumbleBundles({ types, force });
  return state.result;
}

/** Resolve the channel from a mention, an id argument, or the current channel. */
function resolveChannel(message, args) {
  const mentioned = message?.mentions?.channels?.first?.();
  if (mentioned) return mentioned;

  const id = args.find((arg) => /^\d{17,20}$/.test(arg));
  if (id) return message.guild?.channels?.cache?.get(id) || null;

  return null;
}

function parseTypes(args) {
  const found = args
    .map((arg) => String(arg || '').toLowerCase())
    .find((arg) => arg === 'all' || BUNDLE_TYPES.includes(arg));

  if (found === 'all') return [...BUNDLE_TYPES];
  if (found) return [found];
  return ['games'];
}

async function handleSet(message, args) {
  if (!canManage(message)) {
    return message.reply('❌ You need **Manage Server** permission to set the alert channel.');
  }

  const channel = resolveChannel(message, args);
  if (!channel) {
    return message.reply(
      '❌ Mention the channel that should receive bundle alerts, e.g. `!humblebundle set #deals`.'
    );
  }

  const types = parseTypes(args);

  let result;
  try {
    result = await humbleBundleAlerts.enable(message.guild.id, channel.id, { types });
  } catch (error) {
    return message.reply(`❌ Could not enable alerts: ${error.message || error}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ea043)
    .setTitle('✅ Humble Bundle alerts enabled')
    .setDescription(
      [
        `Every new bundle gets its own message in <#${channel.id}>.`,
        'When a bundle ends, the bot deletes its message, so the channel only shows what is live.',
        'Needs **Manage Messages** to remove the ended ones.',
      ].join('\n')
    )
    .addFields(
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Watching', value: typeLabel(types), inline: true },
      {
        name: 'Tracked now',
        value: `${result.seeded} bundle(s)`,
        inline: true,
      }
    )
    .setFooter({
      text: 'Checks every 30 minutes · change types with !humblebundle set #channel all',
    })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
}

async function handleStatus(message) {
  const status = humbleBundleAlerts.getStatus(message.guild?.id);

  if (!status) {
    return message.reply(
      '📡 No bundle alerts configured here. Set them up with `!humblebundle set #deals`.'
    );
  }

  const unix = (value) =>
    value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:R>` : 'never';

  const embed = new EmbedBuilder()
    .setColor(status.enabled ? 0x2ea043 : 0xfee75c)
    .setTitle('📡 Humble Bundle alerts')
    .addFields(
      { name: 'Channel', value: `<#${status.channelId}>`, inline: true },
      { name: 'Status', value: status.enabled ? 'Enabled' : 'Paused', inline: true },
      { name: 'Types', value: typeLabel(status.types), inline: true },
      { name: 'Tracked', value: `${status.tracked} bundle(s)`, inline: true },
      { name: 'Last checked', value: unix(status.lastCheckedAt), inline: true },
      { name: 'Next bundle ends', value: unix(status.nextEndAt), inline: true }
    )
    .setFooter({ text: 'Checks every 30 minutes' })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
}

async function handleOff(message) {
  if (!canManage(message)) {
    return message.reply('❌ You need **Manage Server** permission to change the alert channel.');
  }

  const disabled = await humbleBundleAlerts.disable(message.guild?.id);
  if (!disabled) {
    return message.reply('📡 Bundle alerts were not configured here.');
  }

  return message.reply('🛑 Humble Bundle alerts are now paused for this server.');
}

module.exports = {
  name: 'humblebundle',
  description: 'Browse active Humble Bundles, or set up automatic new/ended bundle alerts',
  usage:
    '!humblebundle [games|books|software|all] [refresh]\n' +
    '!humblebundle set #channel [games|books|software|all]\n' +
    '!humblebundle status\n' +
    '!humblebundle off',
  aliases: ['humble', 'hb', 'bundles'],
  category: 'utility',
  shouldForceRefresh,

  async execute(message, args) {
    const rawArgs = (args || []).map((arg) => String(arg || '').toLowerCase());
    const sub = rawArgs[0];

    // !humblebundle set #deals / !humblebundle #deals
    if (sub === 'set' || sub === 'alerts' || message?.mentions?.channels?.size > 0) {
      return handleSet(
        message,
        rawArgs[0] === 'set' || rawArgs[0] === 'alerts' ? rawArgs.slice(1) : rawArgs
      );
    }

    if (['off', 'disable', 'stop', 'pause'].includes(sub)) {
      return handleOff(message);
    }

    if (['status', 'config', 'info'].includes(sub)) {
      return handleStatus(message);
    }

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
