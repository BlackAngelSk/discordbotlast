const { EmbedBuilder } = require('discord.js');
const {
  getHumbleBundles,
  formatRemaining,
  fitFields,
  BUNDLE_TYPES,
} = require('../../utils/bundles/humbleBundle');

const MAX_FIELDS = 24;
const SOON_MS = 24 * 60 * 60 * 1000;

const TYPE_LABELS = {
  games: 'Games',
  books: 'Books & Comics',
  software: 'Software',
};

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function describeBundle(bundle) {
  const lines = [];

  if (bundle.endDate) {
    const unix = Math.floor(bundle.endDate.getTime() / 1000);
    lines.push(`⏳ Ends in **${formatRemaining(bundle.remainingMs)}** — <t:${unix}:R>`);
    lines.push(`<t:${unix}:f>`);
  } else {
    lines.push('⏳ No end date announced');
  }

  if (bundle.headline) {
    lines.push(`> ${truncate(bundle.headline, 160)}`);
  }

  if (bundle.value) {
    const amount = Number(bundle.value.amount);
    lines.push(`💵 ${amount.toLocaleString('en-US')} ${bundle.value.currency} worth of content`);
  }

  lines.push(`[Open bundle](${bundle.url})`);

  return truncate(lines.join('\n'), 1024);
}

module.exports = {
  name: 'humblebundle',
  description: 'List active Humble Bundles and how long they stay available',
  usage:
    '!humblebundle [games|books|software|all] [refresh]\n' +
    'Examples: `!humblebundle`, `!humblebundle books`, `!humblebundle all refresh`',
  aliases: ['humble', 'hb', 'bundles'],
  category: 'utility',

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

    let statusMessage = null;
    if (refresh) {
      statusMessage = await message.reply('🔄 Refreshing Humble Bundle data…');
    }

    let result;
    try {
      result = await getHumbleBundles({ types, force: refresh });
    } catch (error) {
      const content = `❌ Could not load Humble Bundles: ${error.message || error}`;
      return statusMessage ? statusMessage.edit(content) : message.reply(content);
    }

    if (result.bundles.length === 0) {
      const content = '📭 No active Humble Bundles right now.';
      return statusMessage ? statusMessage.edit(content) : message.reply(content);
    }

    const soon = result.bundles.filter(
      (bundle) => typeof bundle.remainingMs === 'number' && bundle.remainingMs <= SOON_MS
    );
    const typeLabel = types.map((type) => TYPE_LABELS[type] || type).join(' + ');

    const embed = new EmbedBuilder()
      .setColor(0xcc2929)
      .setTitle('🎁 Active Humble Bundles')
      .setURL('https://www.humblebundle.com/bundles')
      .setDescription(
        `**${result.bundles.length}** active ${typeLabel.toLowerCase()} bundle(s)` +
          (soon.length > 0
            ? ` — ⏰ **${soon.length}** end${soon.length === 1 ? 's' : ''} within 24 hours`
            : '') +
          '\nSorted by the ones ending first.'
      )
      .setFooter({
        text: `Fetched ${new Date(result.fetchedAt).toLocaleString('en-GB')} · cached up to 30 min`,
      })
      .setTimestamp(new Date(result.fetchedAt));

    // Discord caps a whole embed at 6000 characters, so the "all" view degrades
    // into a link instead of failing with a 400.
    const { fields, remaining } = fitFields(result.bundles, {
      maxFields: MAX_FIELDS,
      charBudget: 4700,
      baseChars:
        String(embed.data.description || '').length +
        String(embed.data.title || '').length +
        String(embed.data.footer?.text || '').length,
      format: (bundle) => {
        const endingSoon =
          typeof bundle.remainingMs === 'number' &&
          bundle.remainingMs <= SOON_MS &&
          bundle.remainingMs > 0;

        return {
          name: `${endingSoon ? '⏰' : '🎁'} ${truncate(bundle.title, 240)}`,
          value: describeBundle(bundle),
        };
      },
    });

    if (fields.length > 0) embed.addFields(fields);

    if (remaining > 0) {
      embed.addFields({
        name: 'More bundles',
        value: `And **${remaining}** more — see <https://www.humblebundle.com/bundles>.`,
      });
    }

    if (result.failed.length > 0) {
      embed.addFields({
        name: 'Unavailable',
        value: truncate(
          result.failed
            .slice(0, 5)
            .map((entry) => `• ${entry}`)
            .join('\n'),
          1024
        ),
      });
    }

    return statusMessage
      ? statusMessage.edit({ content: null, embeds: [embed] })
      : message.reply({ embeds: [embed] });
  },
};
