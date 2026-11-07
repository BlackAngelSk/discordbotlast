const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const steamFreeGamesAlertsManager = require('../../utils/steamFreeGamesAlertsManager');

const USAGE = [
  '!steampromos list',
  '!steampromos set #channel',
  '!steampromos sales on|off',
  '!steampromos min 50',
  '!steampromos interval 3',
  '!steampromos deals [count]',
  '!steampromos test [#channel]',
  '!steampromos forcecheck',
  '!steampromos remove',
].join('\n');

function parseIntArg(value) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDealList(deals) {
  return deals
    .map((deal) => {
      const price =
        deal.priceOriginal && deal.priceFinal
          ? `~~${deal.priceOriginal}~~ → **${deal.priceFinal}**`
          : deal.priceFinal
            ? `**${deal.priceFinal}**`
            : 'see store';
      return `**[${deal.title}](${deal.url})** · **-${deal.discountPercent}%** · ${price}`;
    })
    .join('\n');
}

module.exports = {
  name: 'steampromos',
  description: 'Steam sale + limited-time promo alerts (games on sale right now).',
  usage: USAGE,
  aliases: ['steampromoalerts', 'steamdeals', 'steamsales', 'steamfreeweekend'],
  category: 'admin',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ You need **Manage Server** permission to use this command.');
    }

    const subcommand = args[0]?.toLowerCase() || 'list';
    const config = steamFreeGamesAlertsManager.getPromoGuildConfig(message.guild.id);
    const dealSettings = steamFreeGamesAlertsManager.getPromoDealSettings(message.guild.id);

    if (subcommand === 'list' || subcommand === 'status') {
      const embed = new EmbedBuilder()
        .setColor(0x66c0f4)
        .setTitle('🔥 Steam Sale + Promo Alerts')
        .setTimestamp();

      if (!config?.channelId) {
        embed.setDescription(
          `No alert channel is configured. Use \`!steampromos set #channel\` to start posting Steam deals.\n\n` +
            `Tracked right now: **${dealSettings.minDiscountPercent}%+ off** games (${dealSettings.minReviewCount}+ reviews).`
        );
        return message.reply({ embeds: [embed] });
      }

      const current = await steamFreeGamesAlertsManager
        .getCurrentDeals(message.guild.id, { limit: 5 })
        .catch(() => null);

      embed.setDescription(`Alerts are posted in <#${config.channelId}>.`).addFields(
        {
          name: 'Steam sales',
          value: dealSettings.salesEnabled
            ? `✅ On — **${dealSettings.minDiscountPercent}%+ off**, up to ${dealSettings.maxDealsPerMessage} deals every ${dealSettings.dealPostIntervalHours}h`
            : '❌ Off',
          inline: true,
        },
        {
          name: 'Free-play promos',
          value: dealSettings.promosEnabled ? '✅ On' : '❌ Off',
          inline: true,
        },
        {
          name: 'Last checked',
          value: config.lastCheckedAt
            ? `<t:${Math.floor(new Date(config.lastCheckedAt).getTime() / 1000)}:R>`
            : 'Not checked yet',
          inline: true,
        }
      );

      if (current?.deals?.length) {
        embed.addFields({
          name: 'Top deals right now',
          value: current.deals
            .map((deal) => `• [${deal.title}](${deal.url}) — **-${deal.discountPercent}%**`)
            .join('\n')
            .slice(0, 1024),
        });
      }

      return message.reply({ embeds: [embed] });
    }

    if (subcommand === 'set') {
      const channel =
        message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!channel) {
        return message.reply(
          '❌ Mention a valid text channel, for example `!steampromos set #game-alerts`.'
        );
      }

      if (!channel.isTextBased()) {
        return message.reply('❌ The Steam alert channel must be a text channel.');
      }

      const botMember = message.guild.members.me;
      if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
        return message.reply(`❌ I need **Send Messages** and **Embed Links** in ${channel}.`);
      }

      const minArg = args.find((arg) => /^min[:=]/i.test(arg));
      const snapshot = await steamFreeGamesAlertsManager.enablePromoAlerts(
        message.guild.id,
        channel.id,
        minArg ? { minDiscountPercent: parseIntArg(minArg.split(/[:=]/)[1]) } : {}
      );

      const settings = steamFreeGamesAlertsManager.getPromoDealSettings(message.guild.id);
      const dealCount = snapshot?.deals?.length || 0;

      return message.reply(
        `✅ Steam alerts enabled in ${channel}.\n` +
          `• Sales: **${settings.minDiscountPercent}%+ off** — ${dealCount} discounted games in the current sample\n` +
          `• The first digest with the best deals goes out on the next check.`
      );
    }

    if (subcommand === 'sales' || subcommand === 'sale') {
      if (!config?.channelId) {
        return message.reply(
          '❌ Steam alerts are not enabled yet. Use `!steampromos set #channel` first.'
        );
      }

      const mode = String(args[1] || '').toLowerCase();
      if (!['on', 'off', 'enable', 'disable'].includes(mode)) {
        return message.reply('❌ Use `!steampromos sales on` or `!steampromos sales off`.');
      }

      const enabled = mode === 'on' || mode === 'enable';
      await steamFreeGamesAlertsManager.updatePromoConfig(message.guild.id, {
        salesEnabled: enabled,
      });

      return message.reply(
        enabled
          ? '✅ Steam **sales** alerts are on — games on sale will be posted again.'
          : '✅ Steam **sales** alerts are off. Free-play promos stay unchanged.'
      );
    }

    if (subcommand === 'min' || subcommand === 'discount') {
      if (!config?.channelId) {
        return message.reply(
          '❌ Steam alerts are not enabled yet. Use `!steampromos set #channel` first.'
        );
      }

      const value = parseIntArg(args[1]);
      if (value === null || value < 5 || value > 95) {
        return message.reply(
          '❌ Give a discount between 5 and 95, for example `!steampromos min 60`.'
        );
      }

      await steamFreeGamesAlertsManager.updatePromoConfig(message.guild.id, {
        minDiscountPercent: value,
      });

      return message.reply(`✅ Deals must now be at least **${value}% off** to be posted.`);
    }

    if (subcommand === 'interval') {
      if (!config?.channelId) {
        return message.reply(
          '❌ Steam alerts are not enabled yet. Use `!steampromos set #channel` first.'
        );
      }

      const value = parseIntArg(args[1]);
      if (value === null || value < 1 || value > 24) {
        return message.reply(
          '❌ Give an interval in hours between 1 and 24, e.g. `!steampromos interval 6`.'
        );
      }

      await steamFreeGamesAlertsManager.updatePromoConfig(message.guild.id, {
        dealPostIntervalHours: value,
      });

      return message.reply(`✅ Deal digests are now posted at most once every **${value}h**.`);
    }

    if (subcommand === 'deals' || subcommand === 'onsale' || subcommand === 'salesnow') {
      const limit = Math.min(10, Math.max(1, parseIntArg(args[1]) || 8));
      const current = await steamFreeGamesAlertsManager.getCurrentDeals(message.guild.id, {
        limit,
        minDiscountPercent: dealSettings.minDiscountPercent,
      });

      if (!current.deals.length) {
        return message.reply(
          `❌ No Steam games are currently **${dealSettings.minDiscountPercent}%+ off** in the sample. Try \`!steampromos min 30\`.`
        );
      }

      const payload = steamFreeGamesAlertsManager.buildDealAlert(current.deals, current.settings, {
        totalAvailable: current.matchingCount,
      });

      for (const messagePayload of payload.messages) {
        await message.channel.send(messagePayload);
      }

      return message.reply(
        `🔥 ${current.deals.length} best deal(s) out of ${current.matchingCount} matching — ${current.totalCount} discounted games sampled from the Steam store.`
      );
    }

    if (subcommand === 'test') {
      const channel =
        message.mentions.channels.first() ||
        (config?.channelId ? message.guild.channels.cache.get(config.channelId) : null) ||
        message.channel;

      if (!channel?.isTextBased()) {
        return message.reply('❌ I could not find a valid text channel for the test alert.');
      }

      const current = await steamFreeGamesAlertsManager.getCurrentDeals(message.guild.id, {
        limit: dealSettings.maxDealsPerMessage,
      });

      let sent = 0;

      if (current.deals.length > 0) {
        const payload = steamFreeGamesAlertsManager.buildDealAlert(
          current.deals,
          current.settings,
          { totalAvailable: current.matchingCount }
        );
        for (const messagePayload of payload.messages) {
          await channel.send(messagePayload);
          sent += 1;
        }
      }

      const promoPayload = steamFreeGamesAlertsManager.buildPromoAlert(current.snapshot);
      if (promoPayload) {
        for (const messagePayload of promoPayload.messages) {
          await channel.send(messagePayload);
          sent += 1;
        }
      }

      if (sent === 0) {
        return message.reply('❌ No Steam deals or promos are available right now.');
      }

      return message.reply(`✅ Sent ${sent} test message(s) with live Steam deals to ${channel}.`);
    }

    if (subcommand === 'forcecheck' || subcommand === 'force' || subcommand === 'checknow') {
      if (!config?.channelId) {
        return message.reply(
          '❌ Steam alerts are not enabled yet. Use `!steampromos set #channel` first.'
        );
      }

      await message.reply('🔄 Running Steam deal force check now... (can take up to 90s)');

      try {
        const snapshot = await steamFreeGamesAlertsManager.forceCheckNow();
        const total = snapshot?.promoGiveaways?.length || 0;
        const dealCount = snapshot?.deals?.length || 0;
        return message.channel.send(
          `✅ Force check complete. **${dealCount}** discounted games sampled, **${total}** limited-time promo game(s) tracked.`
        );
      } catch (error) {
        if (error?.code === 'STEAM_FORCE_CHECK_TIMEOUT') {
          return message.channel.send(
            '⚠️ Force check timed out. The data source was too slow or unresponsive. Try again in a minute.'
          );
        }

        console.error('Steam promos force check failed:', error);
        return message.channel.send(
          '❌ Force check failed due to an internal error. Check logs and try again.'
        );
      }
    }

    if (subcommand === 'remove' || subcommand === 'clear' || subcommand === 'disable') {
      await steamFreeGamesAlertsManager.disablePromoAlerts(message.guild.id);
      return message.reply('✅ Steam sale + promo alerts have been disabled for this server.');
    }

    return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${USAGE}\n\`\`\``);
  },
};
