const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cryptoTrackerManager = require('../../utils/cryptoTrackerManager');
const { formatPrice, formatLargeNumber, getChangeEmoji } = require('../../utils/cryptoTrackerManager');

module.exports = {
    name: 'crypto',
    description: 'Check cryptocurrency prices, manage watchlists, and track your portfolio!',
    usage: '!crypto <price|top|info|watch|portfolio|search> [coin]',
    aliases: ['cr', 'coin', 'coingecko'],
    category: 'utility',
    async execute(message, args) {
        try {
            const subcommand = args[0]?.toLowerCase();

            if (!subcommand) {
                return this.showHelp(message);
            }

            switch (subcommand) {
                case 'price':
                case 'p':
                    return this.showPrice(message, args.slice(1));
                case 'top':
                case 't':
                    return this.showTop(message, args.slice(1));
                case 'info':
                case 'i':
                    return this.showInfo(message, args.slice(1));
                case 'watch':
                case 'w':
                    return this.manageWatchlist(message, args.slice(1));
                case 'unwatch':
                case 'uw':
                    return this.removeFromWatchlist(message, args.slice(1));
                case 'alerts':
                    return this.showWatchlist(message);
                case 'portfolio':
                case 'port':
                    return this.managePortfolio(message, args.slice(1));
                case 'search':
                case 's':
                    return this.searchCoins(message, args.slice(1));
                case 'help':
                    return this.showHelp(message);
                default:
                    return this.showPrice(message, args);
            }
        } catch (error) {
            console.error('Error in crypto command:', error);
            message.reply('❌ An error occurred while using the crypto command!');
        }
    },

    async showHelp(message) {
        const prefix = message.prefix || '!';
        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle('₿ Crypto Tracker Commands')
            .setDescription('Track cryptocurrency prices, set alerts, and manage your portfolio!')
            .addFields(
                { name: '💰 Price Check', value: `\`${prefix}crypto price <coin>\` - Check coin price\n\`${prefix}crypto <coin>\` - Quick price check\n\`${prefix}crypto search <query>\` - Search for coins` },
                { name: '🏆 Top Coins', value: `\`${prefix}crypto top [n]\` - Top N coins by market cap (default 10)` },
                { name: '📊 Coin Info', value: `\`${prefix}crypto info <coin>\` - Detailed coin information` },
                { name: '🔔 Watchlist', value: `\`${prefix}crypto watch <coin> #channel [threshold%]\` - Set price alert\n\`${prefix}crypto unwatch <coin>\` - Remove alert\n\`${prefix}crypto alerts\` - View all alerts` },
                { name: '💼 Portfolio', value: `\`${prefix}crypto portfolio add <coin> <amount> [buyprice]\` - Add holding\n\`${prefix}crypto portfolio remove <index>\` - Remove entry\n\`${prefix}crypto portfolio\` - View portfolio` },
                { name: '📝 Examples', value: `\`${prefix}crypto price bitcoin\`\n\`${prefix}crypto top 5\`\n\`${prefix}crypto watch ethereum #crypto-alerts 5\`\n\`${prefix}crypto portfolio add solana 10 150` }
            )
            .setFooter({ text: 'CoinGecko API • Free, no API key required' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async showPrice(message, args) {
        if (!args.length) {
            return message.reply('❌ Please specify a coin!\nUsage: `!crypto price <coin>` or `!crypto <coin>`');
        }

        const query = args.join(' ');
        const coins = await cryptoTrackerManager.searchCoins(query);
        if (!coins.length) {
            return message.reply('❌ No coins found! Try: bitcoin, ethereum, solana, etc.');
        }

        const coin = coins[0];
        const prices = await cryptoTrackerManager.fetchPrices([coin.id]);
        const priceData = prices[coin.id];

        if (!priceData) {
            return message.reply('❌ Could not fetch price data. Please try again later.');
        }

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

        await message.reply({ embeds: [embed] });
    },

    async showTop(message, args) {
        const limit = Math.min(parseInt(args[0]) || 10, 25);
        const coins = await cryptoTrackerManager.getTopCoins(limit);

        if (!coins.length) {
            return message.reply('❌ Could not fetch top coins. Please try again later.');
        }

        const description = coins.map((c, i) => {
            const change24h = c.change24h || 0;
            const emoji = getChangeEmoji(change24h);
            return `**${i + 1}.** ${emoji} **${c.name}** (${c.symbol.toUpperCase()}) - \`$${formatPrice(c.price)}\` (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%)`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle(`🏆 Top ${limit} Cryptocurrencies`)
            .setDescription(description)
            .setFooter({ text: 'Crypto Tracker • CoinGecko' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async showInfo(message, args) {
        if (!args.length) {
            return message.reply('❌ Please specify a coin!\nUsage: `!crypto info <coin>`');
        }

        const query = args.join(' ');
        const coins = await cryptoTrackerManager.searchCoins(query);
        if (!coins.length) {
            return message.reply('❌ No coins found!');
        }

        const details = await cryptoTrackerManager.getCoinDetails(coins[0].id);
        if (!details) {
            return message.reply('❌ Could not fetch coin details. Please try again later.');
        }

        const symbol = (details.symbol || coins[0].symbol || coins[0].id).toUpperCase();
        const change24h = details.change24h || 0;
        const isUp = change24h > 0;

        const embed = new EmbedBuilder()
            .setColor(isUp ? 0x57f287 : 0xed4245)
            .setTitle(`${isUp ? '📈' : '📉'} ${details.name || coins[0].name} (${symbol})`)
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
            );

        if (details.circulatingSupply) {
            embed.addFields({ name: '🔄 Circulating Supply', value: details.circulatingSupply.toLocaleString(), inline: true });
        }
        if (details.maxSupply) {
            embed.addFields({ name: '🔒 Max Supply', value: details.maxSupply.toLocaleString(), inline: true });
        }

        embed.setFooter({ text: 'Crypto Tracker • CoinGecko' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async manageWatchlist(message, args) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ You need Administrator permission to manage crypto alerts!');
        }

        if (args.length < 2) {
            return message.reply('❌ Usage: `!crypto watch <coin> #channel [threshold%]`\nExample: `!crypto watch bitcoin #crypto-alerts 5`');
        }

        const query = args[0];
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply('❌ Please mention a channel!\nUsage: `!crypto watch <coin> #channel [threshold%]`');
        }

        const threshold = parseFloat(args[2]) || null;
        const coins = await cryptoTrackerManager.searchCoins(query);
        if (!coins.length) {
            return message.reply('❌ No coins found!');
        }

        await cryptoTrackerManager.addWatchlist(message.guild.id, coins[0].id, channel.id, null, threshold);

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🔔 Crypto Alert Set!')
            .setDescription(`Now tracking **${coins[0].name}** (${coins[0].symbol.toUpperCase()})`)
            .addFields(
                { name: '📢 Channel', value: `<#${channel.id}>`, inline: true },
                { name: '💰 Coin', value: `${coins[0].name} (${coins[0].symbol.toUpperCase()})`, inline: true },
                { name: '📊 Threshold', value: threshold ? `>${threshold}%` : 'Any change', inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • Alerts' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async removeFromWatchlist(message, args) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ You need Administrator permission to manage crypto alerts!');
        }

        if (!args.length) {
            return message.reply('❌ Usage: `!crypto unwatch <coin>`');
        }

        const query = args.join(' ');
        const coins = await cryptoTrackerManager.searchCoins(query);
        if (!coins.length) {
            return message.reply('❌ No coins found!');
        }

        const removed = await cryptoTrackerManager.removeWatchlist(message.guild.id, coins[0].id);
        if (removed) {
            await message.reply(`✅ Removed **${coins[0].name}** from watchlist.`);
        } else {
            await message.reply(`❌ **${coins[0].name}** is not in your watchlist.`);
        }
    },

    async showWatchlist(message) {
        const watchlist = cryptoTrackerManager.getWatchlist(message.guild.id);
        if (!watchlist.length) {
            return message.reply('📭 No crypto alerts configured.\nUse `!crypto watch <coin> #channel` to add one!');
        }

        const description = watchlist.map((w, i) => {
            const coin = cryptoTrackerManager.getCoinInfo(w.coinId) || { name: w.coinId, symbol: w.coinId.toUpperCase() };
            return `**${i + 1}.** ${coin.name} (${coin.symbol.toUpperCase()}) → <#${w.channel.id || w.channelId}> ${w.threshold ? `| >${w.threshold}%` : ''}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle('🔔 Crypto Watchlist')
            .setDescription(description)
            .setFooter({ text: 'Crypto Tracker • Watchlist' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async managePortfolio(message, args) {
        const subaction = args[0]?.toLowerCase();

        if (!subaction || subaction === 'view') {
            return this.showPortfolio(message);
        }

        if (subaction === 'add') {
            return this.addToPortfolio(message, args.slice(1));
        }

        if (subaction === 'remove' || subaction === 'rm') {
            return this.removeFromPortfolio(message, args.slice(1));
        }

        return message.reply('❌ Usage:\n`!crypto portfolio` - View portfolio\n`!crypto portfolio add <coin> <amount> [buyprice]` - Add holding\n`!crypto portfolio remove <index>` - Remove entry');
    },

    async showPortfolio(message) {
        const portfolio = cryptoTrackerManager.getPortfolio(message.guild.id, message.author.id);
        if (!portfolio.length) {
            return message.reply('💼 Your portfolio is empty!\nUse `!crypto portfolio add <coin> <amount>` to add a holding.');
        }

        // Get current prices
        const coinIds = [...new Set(portfolio.map(p => p.coinId))];
        const prices = await cryptoTrackerManager.fetchPrices(coinIds);

        let totalValue = 0;
        let totalCost = 0;

        const description = portfolio.map((entry, i) => {
            const coin = cryptoTrackerManager.getCoinInfo(entry.coinId) || { name: entry.coinId, symbol: entry.coinId.toUpperCase() };
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
            .setTitle(`💼 ${message.author.username}'s Crypto Portfolio`)
            .setDescription(description)
            .addFields(
                { name: '💰 Total Value', value: `$${formatPrice(totalValue)}`, inline: true },
                { name: '📊 Total Cost', value: `$${formatPrice(totalCost)}`, inline: true },
                { name: '📈 Total P/L', value: `${totalPnl >= 0 ? '+' : ''}$${formatPrice(totalPnl)} (${totalPnlPercent > 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%)`, inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • Portfolio' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async addToPortfolio(message, args) {
        if (args.length < 2) {
            return message.reply('❌ Usage: `!crypto portfolio add <coin> <amount> [buyprice]`\nExample: `!crypto portfolio add bitcoin 0.5 45000`');
        }

        const query = args[0];
        const amount = parseFloat(args[1]);
        const buyPrice = parseFloat(args[2]) || null;

        if (isNaN(amount) || amount <= 0) {
            return message.reply('❌ Please provide a valid amount!');
        }

        const coins = await cryptoTrackerManager.searchCoins(query);
        if (!coins.length) {
            return message.reply('❌ No coins found!');
        }

        await cryptoTrackerManager.addPortfolioEntry(message.guild.id, message.author.id, coins[0].id, amount, buyPrice);

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('💼 Portfolio Updated!')
            .setDescription(`Added **${amount} ${coins[0].name}** (${coins[0].symbol.toUpperCase()}) to your portfolio.`)
            .addFields(
                { name: '💰 Amount', value: `${amount}`, inline: true },
                { name: '📊 Buy Price', value: buyPrice ? `$${formatPrice(buyPrice)}` : 'Current price', inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async removeFromPortfolio(message, args) {
        if (!args.length) {
            return message.reply('❌ Usage: `!crypto portfolio remove <index>`\nUse `!crypto portfolio` to see indices.');
        }

        const index = parseInt(args[0]) - 1;
        if (isNaN(index) || index < 0) {
            return message.reply('❌ Please provide a valid index!');
        }

        const removed = await cryptoTrackerManager.removePortfolioEntry(message.guild.id, message.author.id, index);
        if (removed) {
            await message.reply('✅ Removed from portfolio!');
        } else {
            await message.reply('❌ Invalid index! Use `!crypto portfolio` to see your holdings.');
        }
    },

    async searchCoins(message, args) {
        if (!args.length) {
            return message.reply('❌ Please specify a search query!\nUsage: `!crypto search <query>`');
        }

        const query = args.join(' ');
        const coins = await cryptoTrackerManager.searchCoins(query);

        if (!coins.length) {
            return message.reply('❌ No coins found!');
        }

        const description = coins.map((c, i) =>
            `**${i + 1}.** ${c.name} (${c.symbol.toUpperCase()}) - \`${c.id}\``
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#f7931a')
            .setTitle(`🔍 Search Results: "${query}"`)
            .setDescription(description)
            .setFooter({ text: 'Crypto Tracker • Use the CoinGecko ID for commands' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};