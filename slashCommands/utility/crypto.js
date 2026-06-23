const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const cryptoTrackerManager = require('../../utils/cryptoTrackerManager');
const { formatPrice, formatLargeNumber, getChangeEmoji, POPULAR_COINS } = require('../../utils/cryptoTrackerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crypto')
        .setDescription('Check cryptocurrency prices and manage your portfolio!')
        .addSubcommand(sub =>
            sub.setName('price')
                .setDescription('Check a coin price')
                .addStringOption(opt =>
                    opt.setName('coin')
                        .setDescription('Coin name or symbol (e.g. bitcoin, eth)')
                        .setRequired(true)
                        .setAutocomplete(true)
                ))
        .addSubcommand(sub =>
            sub.setName('top')
                .setDescription('Show top cryptocurrencies by market cap')
                .addIntegerOption(opt =>
                    opt.setName('count')
                        .setDescription('Number of coins to show (default 10, max 25)')
                        .setMinValue(1)
                        .setMaxValue(25)
                ))
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Detailed information about a coin')
                .addStringOption(opt =>
                    opt.setName('coin')
                        .setDescription('Coin name or symbol')
                        .setRequired(true)
                        .setAutocomplete(true)
                ))
        .addSubcommand(sub =>
            sub.setName('portfolio')
                .setDescription('View your crypto portfolio'))
        .addSubcommand(sub =>
            sub.setName('portfolio-add')
                .setDescription('Add a coin to your portfolio')
                .addStringOption(opt =>
                    opt.setName('coin')
                        .setDescription('Coin name or symbol')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addNumberOption(opt =>
                    opt.setName('amount')
                        .setDescription('Amount of coins you hold')
                        .setRequired(true)
                        .setMinValue(0.00000001)
                )
                .addNumberOption(opt =>
                    opt.setName('buy-price')
                        .setDescription('Buy price per coin in USD (optional)')
                        .setMinValue(0)
                ))
        .addSubcommand(sub =>
            sub.setName('portfolio-remove')
                .setDescription('Remove a coin from your portfolio')
                .addIntegerOption(opt =>
                    opt.setName('index')
                        .setDescription('Index of the entry to remove (use /crypto portfolio to see)')
                        .setRequired(true)
                        .setMinValue(1)
                ))
        .addSubcommand(sub =>
            sub.setName('watch')
                .setDescription('Set a price alert for a coin (Admin only)')
                .addStringOption(opt =>
                    opt.setName('coin')
                        .setDescription('Coin name or symbol')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel for alerts')
                        .setRequired(true)
                )
                .addNumberOption(opt =>
                    opt.setName('threshold')
                        .setDescription('Alert when price changes by this % (e.g. 5)')
                        .setMinValue(0.1)
                        .setMaxValue(100)
                ))
        .addSubcommand(sub =>
            sub.setName('unwatch')
                .setDescription('Remove a price alert (Admin only)')
                .addStringOption(opt =>
                    opt.setName('coin')
                        .setDescription('Coin name or symbol')
                        .setRequired(true)
                        .setAutocomplete(true)
                ))
        .addSubcommand(sub =>
            sub.setName('alerts')
                .setDescription('View all configured price alerts')),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        if (!focused) {
            const choices = POPULAR_COINS.slice(0, 25).map(c => ({
                name: `${c.name} (${c.symbol.toUpperCase()})`,
                value: c.id
            }));
            return interaction.respond(choices);
        }

        const matched = POPULAR_COINS.filter(c =>
            c.id.includes(focused) || c.symbol.includes(focused) || c.name.toLowerCase().includes(focused)
        ).slice(0, 25);

        const choices = matched.map(c => ({
            name: `${c.name} (${c.symbol.toUpperCase()})`,
            value: c.id
        }));

        if (choices.length === 0) {
            const results = await cryptoTrackerManager.searchCoins(focused);
            return interaction.respond(results.slice(0, 25).map(c => ({
                name: `${c.name} (${c.symbol.toUpperCase()})`,
                value: c.id
            })));
        }

        await interaction.respond(choices);
    },

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();

            switch (sub) {
                case 'price':
                    return this.handlePrice(interaction);
                case 'top':
                    return this.handleTop(interaction);
                case 'info':
                    return this.handleInfo(interaction);
                case 'portfolio':
                    return this.handlePortfolio(interaction);
                case 'portfolio-add':
                    return this.handlePortfolioAdd(interaction);
                case 'portfolio-remove':
                    return this.handlePortfolioRemove(interaction);
                case 'watch':
                    return this.handleWatch(interaction);
                case 'unwatch':
                    return this.handleUnwatch(interaction);
                case 'alerts':
                    return this.handleAlerts(interaction);
            }
        } catch (error) {
            console.error('Error in crypto slash command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while using the crypto command!', flags: MessageFlags.Ephemeral });
            }
        }
    },

    async handlePrice(interaction) {
        const coinId = interaction.options.getString('coin');
        await interaction.deferReply();

        const prices = await cryptoTrackerManager.fetchPrices([coinId]);
        const priceData = prices[coinId];

        if (!priceData) {
            return interaction.editReply('❌ Could not fetch price data. Make sure the coin ID is valid.');
        }

        const coin = POPULAR_COINS.find(c => c.id === coinId) || { name: coinId, symbol: coinId.toUpperCase() };
        const change24h = priceData.usd_24h_change || 0;
        const isUp = change24h > 0;

        const embed = new EmbedBuilder()
            .setColor(isUp ? 0x57f287 : 0xed4245)
            .setTitle(`${getChangeEmoji(change24h)} ${coin.name} (${coin.symbol.toUpperCase()})`)
            .addFields(
                { name: '💰 Price', value: `$${formatPrice(priceData.usd)}`, inline: true },
                { name: '📊 24h Change', value: `${isUp ? '+' : ''}${change24h.toFixed(2)}%`, inline: true },
                { name: '📈 Market Cap', value: formatLargeNumber(priceData.usd_market_cap), inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • CoinGecko' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleTop(interaction) {
        const count = interaction.options.getInteger('count') || 10;
        await interaction.deferReply();

        const coins = await cryptoTrackerManager.getTopCoins(count);
        if (!coins.length) {
            return interaction.editReply('❌ Could not fetch top coins.');
        }

        const description = coins.map((c, i) => {
            const change24h = c.change24h || 0;
            const emoji = getChangeEmoji(change24h);
            return `**${i + 1}.** ${emoji} **${c.name}** (${c.symbol.toUpperCase()}) - \`$${formatPrice(c.price)}\` (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%)`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle(`🏆 Top ${count} Cryptocurrencies`)
            .setDescription(description)
            .setFooter({ text: 'Crypto Tracker • CoinGecko' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleInfo(interaction) {
        const coinId = interaction.options.getString('coin');
        await interaction.deferReply();

        const details = await cryptoTrackerManager.getCoinDetails(coinId);
        if (!details) {
            return interaction.editReply('❌ Could not fetch coin details.');
        }

        const symbol = (details.symbol || coinId || '').toUpperCase();
        const change24h = details.change24h || 0;
        const isUp = change24h > 0;

        const embed = new EmbedBuilder()
            .setColor(isUp ? 0x57f287 : 0xed4245)
            .setTitle(`${isUp ? '📈' : '📉'} ${details.name || coinId} (${symbol})`)
            .setThumbnail(details.image)
            .addFields(
                { name: '💰 Current Price', value: `$${formatPrice(details.price)}`, inline: true },
                { name: '🏅 Market Rank', value: `#${details.rank || 'N/A'}`, inline: true },
                { name: '📊 Market Cap', value: formatLargeNumber(details.marketCap), inline: true },
                { name: '📈 24h Change', value: `${isUp ? '+' : ''}${(details.change24h || 0).toFixed(2)}%`, inline: true },
                { name: '📊 7d Change', value: `${(details.change7d || 0) > 0 ? '+' : ''}${(details.change7d || 0).toFixed(2)}%`, inline: true },
                { name: '📊 30d Change', value: `${(details.change30d || 0) > 0 ? '+' : ''}${(details.change30d || 0).toFixed(2)}%`, inline: true },
                { name: '⬆️ 24h High', value: `$${formatPrice(details.high24h)}`, inline: true },
                { name: '⬇️ 24h Low', value: `$${formatPrice(details.low24h)}`, inline: true },
                { name: '📊 24h Volume', value: formatLargeNumber(details.volume24h), inline: true },
                { name: '🔝 All-Time High', value: `$${formatPrice(details.ath)}`, inline: true },
                { name: '📉 From ATH', value: `${(details.athChange || 0).toFixed(2)}%`, inline: true },
                { name: '🔗 Website', value: details.website ? `[${symbol}.com](${details.website})` : 'N/A', inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • CoinGecko' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handlePortfolio(interaction) {
        await interaction.deferReply();
        const portfolio = cryptoTrackerManager.getPortfolio(interaction.guild.id, interaction.user.id);

        if (!portfolio.length) {
            return interaction.editReply({ content: '💼 Your portfolio is empty!\nUse `/crypto portfolio-add` to add a holding.', flags: MessageFlags.Ephemeral });
        }

        const coinIds = [...new Set(portfolio.map(p => p.coinId))];
        const prices = await cryptoTrackerManager.fetchPrices(coinIds);

        let totalValue = 0;
        let totalCost = 0;

        const description = portfolio.map((entry, i) => {
            const coin = POPULAR_COINS.find(c => c.id === entry.coinId) || { name: entry.coinId, symbol: entry.coinId.toUpperCase() };
            const currentPrice = prices[entry.coinId]?.usd || 0;
            const value = entry.amount * currentPrice;
            const cost = entry.amount * (entry.buyPrice || currentPrice);
            const pnl = value - cost;
            const pnlPercent = cost > 0 ? ((pnl / cost) * 100) : 0;

            totalValue += value;
            totalCost += cost;

            return `**${i + 1}.** ${coin.name} (${coin.symbol.toUpperCase()})\n   Amount: \`${entry.amount}\` | Buy: \`$${formatPrice(entry.buyPrice)}\` | Now: \`$${formatPrice(currentPrice)}\`\n   P/L: ${pnl >= 0 ? '+' : ''}$${formatPrice(pnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`;
        }).join('\n\n');

        const totalPnl = totalValue - totalCost;
        const totalPnlPercent = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;

        const embed = new EmbedBuilder()
            .setColor(totalPnl >= 0 ? 0x57f287 : 0xed4245)
            .setTitle(`💼 ${interaction.user.username}'s Crypto Portfolio`)
            .setDescription(description)
            .addFields(
                { name: '💰 Total Value', value: `$${formatPrice(totalValue)}`, inline: true },
                { name: '📊 Total Cost', value: `$${formatPrice(totalCost)}`, inline: true },
                { name: '📈 Total P/L', value: `${totalPnl >= 0 ? '+' : ''}$${formatPrice(totalPnl)} (${totalPnlPercent > 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%)`, inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • Portfolio' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handlePortfolioAdd(interaction) {
        const coinId = interaction.options.getString('coin');
        const amount = interaction.options.getNumber('amount');
        const buyPrice = interaction.options.getNumber('buy-price') || null;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await cryptoTrackerManager.addPortfolioEntry(interaction.guild.id, interaction.user.id, coinId, amount, buyPrice);

        const coin = POPULAR_COINS.find(c => c.id === coinId) || { name: coinId, symbol: coinId.toUpperCase() };

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('💼 Portfolio Updated!')
            .setDescription(`Added **${amount} ${coin.name}** (${coin.symbol.toUpperCase()}) to your portfolio.`)
            .addFields(
                { name: '💰 Amount', value: `${amount}`, inline: true },
                { name: '📊 Buy Price', value: buyPrice ? `$${formatPrice(buyPrice)}` : 'Current price', inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handlePortfolioRemove(interaction) {
        const index = interaction.options.getInteger('index') - 1;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const removed = await cryptoTrackerManager.removePortfolioEntry(interaction.guild.id, interaction.user.id, index);
        if (removed) {
            await interaction.editReply({ content: '✅ Removed from portfolio!' });
        } else {
            await interaction.editReply({ content: '❌ Invalid index! Use `/crypto portfolio` to see your holdings.' });
        }
    },

    async handleWatch(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ You need Administrator permission to manage crypto alerts!', flags: MessageFlags.Ephemeral });
        }

        const coinId = interaction.options.getString('coin');
        const channel = interaction.options.getChannel('channel');
        const threshold = interaction.options.getNumber('threshold') || null;

        await interaction.deferReply();

        await cryptoTrackerManager.addWatchlist(interaction.guild.id, coinId, channel.id, null, threshold);

        const coin = POPULAR_COINS.find(c => c.id === coinId) || { name: coinId, symbol: coinId.toUpperCase() };

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🔔 Crypto Alert Set!')
            .setDescription(`Now tracking **${coin.name}** (${coin.symbol.toUpperCase()})`)
            .addFields(
                { name: '📢 Channel', value: `<#${channel.id}>`, inline: true },
                { name: '💰 Coin', value: `${coin.name} (${coin.symbol.toUpperCase()})`, inline: true },
                { name: '📊 Threshold', value: threshold ? `>${threshold}%` : 'Any change', inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • Alerts' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleUnwatch(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ You need Administrator permission to manage crypto alerts!', flags: MessageFlags.Ephemeral });
        }

        const coinId = interaction.options.getString('coin');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const removed = await cryptoTrackerManager.removeWatchlist(interaction.guild.id, coinId);
        const coin = POPULAR_COINS.find(c => c.id === coinId) || { name: coinId, symbol: coinId.toUpperCase() };

        if (removed) {
            await interaction.editReply({ content: `✅ Removed **${coin.name}** from watchlist.` });
        } else {
            await interaction.editReply({ content: `❌ **${coin.name}** is not in your watchlist.` });
        }
    },

    async handleAlerts(interaction) {
        await interaction.deferReply();
        const watchlist = cryptoTrackerManager.getWatchlist(interaction.guild.id);

        if (!watchlist.length) {
            return interaction.editReply({ content: '📭 No crypto alerts configured.\nUse `/crypto watch` to add one!', flags: MessageFlags.Ephemeral });
        }

        const description = watchlist.map((w, i) => {
            const coin = POPULAR_COINS.find(c => c.id === w.coinId) || { name: w.coinId, symbol: w.coinId.toUpperCase() };
            return `**${i + 1}.** ${coin.name} (${coin.symbol.toUpperCase()}) → <#${w.channelId}> ${w.threshold ? `| >${w.threshold}%` : ''}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle('🔔 Crypto Watchlist')
            .setDescription(description)
            .setFooter({ text: 'Crypto Tracker • Watchlist' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};