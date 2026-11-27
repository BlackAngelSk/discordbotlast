const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getHumbleBundles,
  buildBundleEmbed,
  chunkEmbeds,
  BUNDLE_TYPES,
} = require('../../utils/bundles/humbleBundle');
const humbleBundleAlerts = require('../../utils/bundles/humbleBundleAlerts');

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

/**
 * Every active bundle, one embed each, packed into as few messages as Discord
 * accepts (10 embeds / ~5500 characters per message). No pagination.
 */
function buildPayloads(state) {
  const activeKey = typeKey(state.types);
  const meta = TYPE_META[activeKey];
  const bundles = state.result?.bundles || [];
  const soon = bundles.filter(
    (bundle) => typeof bundle.remainingMs === 'number' && bundle.remainingMs <= SOON_MS
  );

  const embeds = bundles.map((bundle, index) =>
    buildBundleEmbed(bundle, { index, soonMs: SOON_MS, showType: true })
  );

  if (embeds.length === 0) {
    embeds.push(
      new EmbedBuilder()
        .setColor(meta.color)
        .setDescription('📭 No active bundles in this category right now.')
    );
  } else {
    embeds[embeds.length - 1].setFooter({
      text: `${bundles.length} bundle(s) · soonest ending first · updated ${new Date(
        state.result?.fetchedAt || Date.now()
      ).toLocaleString('en-GB')}`,
    });
  }

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

  const header = [
    `${meta.emoji} **${meta.label}**`,
    `**${bundles.length}** active`,
    soon.length > 0 ? `⏰ **${soon.length}** ending <24h` : null,
    state.force ? 'refreshed now' : 'cached 30 min',
  ]
    .filter(Boolean)
    .join(' · ');

  return chunkEmbeds(embeds).map((chunk, index) => ({
    ...(index === 0 ? { content: header } : {}),
    embeds: chunk,
  }));
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
  description: 'List every active Humble Bundle, or set up automatic new/ended bundle alerts',
  usage:
    '!humblebundle [games|books|software|all] [refresh]\n' +
    '!humblebundle set #channel [games|books|software|all]\n' +
    '!humblebundle status\n' +
    '!humblebundle off',
  aliases: ['humble', 'hb', 'bundles'],
  category: 'utility',
  shouldForceRefresh,
  buildPayloads,

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
    const state = { types, result: null, force: false };

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

    const payloads = buildPayloads(state);
    const sendToChannel =
      typeof message.channel?.send === 'function'
        ? (payload) => message.channel.send(payload)
        : (payload) => message.reply(payload);

    let first = true;
    for (const payload of payloads) {
      if (first) {
        if (statusMessage) await statusMessage.edit(payload);
        else await message.reply(payload);
        first = false;
        continue;
      }

      await sendToChannel(payload);
    }

    return payloads.length;
  },
};
