/**
 * Crypto Tracker Manager
 * Tracks cryptocurrency prices using CoinGecko free API (no API key required).
 * Features: price checks, watchlists, alerts, portfolio tracking.
 */
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'cryptoTracker.json');
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL = 60 * 1000; // 1 minute price cache

// Popular coins for autocomplete/search
const POPULAR_COINS = [
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
    { id: 'tether', symbol: 'usdt', name: 'Tether' },
    { id: 'binancecoin', symbol: 'bnb', name: 'BNB' },
    { id: 'solana', symbol: 'sol', name: 'Solana' },
    { id: 'ripple', symbol: 'xrp', name: 'XRP' },
    { id: 'usd-coin', symbol: 'usdc', name: 'USD Coin' },
    { id: 'staked-ether', symbol: 'steth', name: 'Lido Staked Ether' },
    { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin' },
    { id: 'cardano', symbol: 'ada', name: 'Cardano' },
    { id: 'tron', symbol: 'trx', name: 'TRON' },
    { id: 'avalanche-2', symbol: 'avax', name: 'Avalanche' },
    { id: 'polkadot', symbol: 'dot', name: 'Polkadot' },
    { id: 'chainlink', symbol: 'link', name: 'Chainlink' },
    { id: 'matic-network', symbol: 'matic', name: 'Polygon' },
    { id: 'litecoin', symbol: 'ltc', name: 'Litecoin' },
    { id: 'uniswap', symbol: 'uni', name: 'Uniswap' },
    { id: 'shiba-inu', symbol: 'shib', name: 'Shiba Inu' },
    { id: 'cosmos', symbol: 'atom', name: 'Cosmos' },
    { id: 'stellar', symbol: 'xlm', name: 'Stellar' },
    { id: 'monero', symbol: 'xmr', name: 'Monero' },
    { id: 'bitcoin-cash', symbol: 'bch', name: 'Bitcoin Cash' },
    { id: 'the-graph', symbol: 'grt', name: 'The Graph' },
    { id: 'filecoin', symbol: 'fil', name: 'Filecoin' },
    { id: 'hedera-hashgraph', symbol: 'hbar', name: 'Hedera' },
];

class CryptoTrackerManager {
    constructor() {
        // data: { guildId: { watchlist: [{coinId, channelId, roleId, threshold}], portfolio: {userId: [{coinId, amount, buyPrice}]} } }
        this.data = {};
        this._priceCache = new Map(); // coinId -> { price, timestamp }
        this._interval = null;
        this._client = null;
        this._warnedMissingApi = false;
    }

    async init(client) {
        this._client = client;
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
        this._startPolling();
    }

    async save() {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    // ── CoinGecko API ──────────────────────────────────────────────────────
    _httpsGet(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'DiscordBot-CryptoTracker/1.0'
                }
            };
            const req = https.get(options, res => {
                let data = '';
                res.on('data', c => (data += c));
                res.on('end', () => {
                    try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                    catch { resolve({ status: res.statusCode, body: data }); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    async _fetchPrice(coinId) {
        // Check cache
        const cached = this._priceCache.get(coinId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.price;
        }

        try {
            const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
            const res = await this._httpsGet(url);
            if (res.status === 429) {
                // Rate limited - use cache if available
                return cached?.price || null;
            }
            if (res.body?.[coinId]) {
                const priceData = res.body[coinId];
                this._priceCache.set(coinId, {
                    price: priceData,
                    timestamp: Date.now()
                });
                return priceData;
            }
        } catch (err) {
            console.error(`Crypto price fetch error (${coinId}):`, err.message);
        }
        return cached?.price || null;
    }

    async fetchPrices(coinIds) {
        if (!coinIds.length) return {};
        const results = {};

        // CoinGecko free API allows multiple IDs in one call
        try {
            const ids = coinIds.join(',');
            const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_7d_change=true`;
            const res = await this._httpsGet(url);

            if (res.status === 429) {
                console.warn('Crypto API rate limited (429). Falling back to cache.');
                // Rate limited - fall back to cache
                for (const id of coinIds) {
                    const cached = this._priceCache.get(id);
                    if (cached) results[id] = cached.price;
                }
                return results;
            }

            if (res.status >= 400) {
                console.warn(`Crypto API error: HTTP ${res.status}`, typeof res.body === 'string' ? res.body.substring(0, 200) : '');
                // Fall back to cache
                for (const id of coinIds) {
                    const cached = this._priceCache.get(id);
                    if (cached) results[id] = cached.price;
                }
                return results;
            }

            if (res.body && typeof res.body === 'object') {
                for (const id of coinIds) {
                    if (res.body[id]) {
                        results[id] = res.body[id];
                        this._priceCache.set(id, { price: res.body[id], timestamp: Date.now() });
                    }
                }
            }
        } catch (err) {
            console.error('Crypto batch price fetch error:', err.message);
            // Fall back to cache on network errors
            for (const id of coinIds) {
                const cached = this._priceCache.get(id);
                if (cached) results[id] = cached.price;
            }
        }
        return results;
    }

    async searchCoins(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return POPULAR_COINS.slice(0, 10);

        // First check popular coins
        const matched = POPULAR_COINS.filter(c =>
            c.id.includes(q) || c.symbol.includes(q) || c.name.toLowerCase().includes(q)
        );
        if (matched.length > 0) return matched.slice(0, 10);

        // Then search CoinGecko
        try {
            const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(q)}`;
            const res = await this._httpsGet(url);
            if (res.body?.coins) {
                return res.body.coins.slice(0, 10).map(c => ({
                    id: c.id,
                    symbol: c.symbol,
                    name: c.name
                }));
            }
        } catch (err) {
            console.error('Coin search error:', err.message);
        }
        return [];
    }

    async getCoinDetails(coinId) {
        try {
            const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
            const res = await this._httpsGet(url);
            if (res.body) {
                const c = res.body;
                return {
                    id: c.id,
                    symbol: c.symbol || c.id,
                    name: c.name || c.id,
                    image: c.image?.large,
                    price: c.market_data?.current_price?.usd,
                    marketCap: c.market_data?.market_cap?.usd,
                    volume24h: c.market_data?.total_volume?.usd,
                    change24h: c.market_data?.price_change_percentage_24h,
                    change7d: c.market_data?.price_change_percentage_7d,
                    change30d: c.market_data?.price_change_percentage_30d,
                    high24h: c.market_data?.high_24h?.usd,
                    low24h: c.market_data?.low_24h?.usd,
                    ath: c.market_data?.ath?.usd,
                    athChange: c.market_data?.ath_change_percentage?.usd,
                    athDate: c.market_data?.ath_date?.usd,
                    circulatingSupply: c.market_data?.circulating_supply,
                    totalSupply: c.market_data?.total_supply,
                    maxSupply: c.market_data?.max_supply,
                    rank: c.market_cap_rank,
                    description: c.description?.en?.substring(0, 200),
                    website: c.links?.homepage?.[0]
                };
            }
        } catch (err) {
            console.error(`Coin details error (${coinId}):`, err.message);
        }
        return null;
    }

    async getTopCoins(limit = 20) {
        try {
            const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`;
            const res = await this._httpsGet(url);
            if (Array.isArray(res.body)) {
                return res.body.map(c => ({
                    id: c.id,
                    symbol: c.symbol,
                    name: c.name,
                    image: c.image,
                    price: c.current_price,
                    marketCap: c.market_cap,
                    change24h: c.price_change_percentage_24h,
                    rank: c.market_cap_rank
                }));
            }
        } catch (err) {
            console.error('Top coins fetch error:', err.message);
        }
        return [];
    }

    // ── Watchlist ───────────────────────────────────────────────────────────
    async addWatchlist(guildId, coinId, channelId, roleId = null, threshold = null) {
        if (!this.data[guildId]) this.data[guildId] = { watchlist: [], portfolio: {} };
        const existing = this.data[guildId].watchlist.find(w => w.coinId === coinId);
        if (existing) {
            existing.channelId = channelId;
            existing.roleId = roleId;
            if (threshold !== null) existing.threshold = threshold;
        } else {
            this.data[guildId].watchlist.push({ coinId, channelId, roleId, threshold, lastPrice: null });
        }
        await this.save();
        return true;
    }

    async removeWatchlist(guildId, coinId) {
        if (!this.data[guildId]) return false;
        const before = this.data[guildId].watchlist.length;
        this.data[guildId].watchlist = this.data[guildId].watchlist.filter(w => w.coinId !== coinId);
        if (this.data[guildId].watchlist.length === before) return false;
        await this.save();
        return true;
    }

    getWatchlist(guildId) {
        return this.data[guildId]?.watchlist || [];
    }

    // ── Portfolio ───────────────────────────────────────────────────────────
    async addPortfolioEntry(guildId, userId, coinId, amount, buyPrice) {
        if (!this.data[guildId]) this.data[guildId] = { watchlist: [], portfolio: {} };
        if (!this.data[guildId].portfolio[userId]) this.data[guildId].portfolio[userId] = [];
        this.data[guildId].portfolio[userId].push({ coinId, amount, buyPrice, timestamp: Date.now() });
        await this.save();
    }

    async removePortfolioEntry(guildId, userId, index) {
        const entries = this.data[guildId]?.portfolio?.[userId];
        if (!entries || index < 0 || index >= entries.length) return false;
        entries.splice(index, 1);
        if (entries.length === 0) delete this.data[guildId].portfolio[userId];
        await this.save();
        return true;
    }

    getPortfolio(guildId, userId) {
        return this.data[guildId]?.portfolio?.[userId] || [];
    }

    // ── Alerts / Polling ────────────────────────────────────────────────────
    _startPolling() {
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => this._poll().catch(() => {}), POLL_INTERVAL);
        setTimeout(() => this._poll().catch(() => {}), 15000);
    }

    async _poll() {
        if (!this._client) return;

        for (const [guildId, config] of Object.entries(this.data)) {
            if (!config.watchlist?.length) continue;

            for (const entry of config.watchlist) {
                try {
                    const priceData = await this._fetchPrice(entry.coinId);
                    if (!priceData) continue;

                    const currentPrice = priceData.usd;
                    const change24h = priceData.usd_24h_change;

                    // Check threshold alert
                    if (entry.threshold && entry.lastPrice) {
                        const changePercent = ((currentPrice - entry.lastPrice) / entry.lastPrice) * 100;
                        if (Math.abs(changePercent) >= entry.threshold) {
                            await this._postPriceAlert(guildId, entry, currentPrice, change24h, changePercent);
                        }
                    }

                    entry.lastPrice = currentPrice;
                } catch (err) {
                    console.error(`Crypto poll error (${entry.coinId}):`, err.message);
                }
            }
            await this.save();
        }
    }

    async _postPriceAlert(guildId, entry, price, change24h, changePercent) {
        if (!this._client) return;
        const channel = this._client.channels.cache.get(entry.channelId);
        if (!channel) return;

        const { EmbedBuilder } = require('discord.js');
        const coin = POPULAR_COINS.find(c => c.id === entry.coinId) || { name: entry.coinId, symbol: entry.coinId.toUpperCase() };
        const isUp = changePercent > 0;

        const embed = new EmbedBuilder()
            .setColor(isUp ? 0x57f287 : 0xed4245)
            .setTitle(`${isUp ? '📈' : '📉'} ${coin.name} (${coin.symbol.toUpperCase()}) Price Alert!`)
            .setDescription(`**${coin.name}** has moved **${isUp ? '+' : ''}${changePercent.toFixed(2)}%** in the last period!`)
            .addFields(
                { name: '💰 Current Price', value: `$${formatPrice(price)}`, inline: true },
                { name: '📊 24h Change', value: `${isUp ? '+' : ''}${(change24h || 0).toFixed(2)}%`, inline: true },
                { name: '🔔 Alert Threshold', value: `>${entry.threshold}%`, inline: true }
            )
            .setFooter({ text: 'Crypto Tracker • Price Alert' })
            .setTimestamp();

        const mention = entry.roleId ? `<@&${entry.roleId}> ` : '';
        await channel.send({ content: `${mention}🔔 **${coin.name}** price alert!`, embeds: [embed] }).catch(() => {});
    }

    // ── Formatting Helpers ──────────────────────────────────────────────────
    getCoinInfo(coinId) {
        return POPULAR_COINS.find(c => c.id === coinId) || null;
    }

    getAllCoins() {
        return [...POPULAR_COINS];
    }
}

function formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01) return price.toFixed(4);
    if (price >= 0.0001) return price.toFixed(6);
    return price.toFixed(8);
}

function formatLargeNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function getChangeEmoji(value) {
    if (value > 0) return '📈';
    if (value < 0) return '📉';
    return '➡️';
}

module.exports = new CryptoTrackerManager();
module.exports.formatPrice = formatPrice;
module.exports.formatLargeNumber = formatLargeNumber;
module.exports.getChangeEmoji = getChangeEmoji;
module.exports.POPULAR_COINS = POPULAR_COINS;