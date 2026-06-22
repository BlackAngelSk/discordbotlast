const { EmbedBuilder } = require('discord.js');
const { fetch } = require('undici');

// In-memory rate cache with 10-minute TTL
const rateCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Currencies that don't use decimal places (0 decimals)
const ZERO_DECIMAL_CURRENCIES = new Set([
    'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'KWD', 'BHD', 'OMR', 'PYG',
    'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF'
]);

// Common currency codes for autocomplete hints
const POPULAR_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'MXN',
    'BRL', 'KRW', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF',
    'TRY', 'ZAR', 'RUB', 'NZD', 'THB', 'IDR', 'MYR', 'PHP', 'SAR', 'AED'
];

async function getRates(baseCurrency) {
    const base = baseCurrency.toUpperCase();
    const cached = rateCache.get(base);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.rates;
    }

    const url = `https://api.exchangerate-api.com/v4/latest/${base}`;
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    const rates = data.rates;

    // Cache the rates
    rateCache.set(base, { rates, timestamp: Date.now() });

    return rates;
}

function formatAmount(amount, currency) {
    const decimals = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function parseArgs(args) {
    if (args.length < 2) return null;

    // Join all args and normalize
    const input = args.join(' ').toUpperCase().trim();
    
    // Remove "TO" keyword if present
    const cleaned = input.replace(/\bTO\b/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/\s+/);

    if (parts.length < 3) return null;

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0 || !isFinite(amount)) return null;

    const fromCurrency = parts[1];
    const toCurrency = parts[2];

    // Validate currency codes (3 letters)
    if (!/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency)) return null;
    // Prevent using same currency
    if (fromCurrency === toCurrency) return null;

    return { amount, from: fromCurrency, to: toCurrency };
}

module.exports = {
    name: 'convert',
    description: 'Convert between currencies (e.g., convert 100 USD to EUR)',
    async execute(message, args, client) {
        const parsed = parseArgs(args);
        if (!parsed) {
            const embed = new EmbedBuilder()
                .setColor('#ed4245')
                .setTitle('❌ Invalid Usage')
                .setDescription(
                    '**Usage:** `convert <amount> <from> to <to>`\n\n' +
                    '**Examples:**\n' +
                    '`convert 100 USD to EUR`\n' +
                    '`convert 50 EUR GBP`\n' +
                    '`convert 1000 JPY USD`\n\n' +
                    '**Supported currencies:** 3-letter ISO codes (e.g., USD, EUR, GBP, JPY, etc.)'
                );
            return message.reply({ embeds: [embed] });
        }

        const { amount, from, to } = parsed;

        // Defer reply since we're making an API call
        const reply = await message.reply('💱 Fetching exchange rates...');

        try {
            const rates = await getRates(from);
            const rate = rates[to];

            if (!rate) {
                const embed = new EmbedBuilder()
                    .setColor('#ed4245')
                    .setTitle('❌ Unknown Currency')
                    .setDescription(
                        `**${to}** is not a recognized currency code.\n\n` +
                        `Make sure you're using a valid 3-letter ISO currency code (e.g., USD, EUR, GBP).`
                    );
                return reply.edit({ content: null, embeds: [embed] });
            }

            const converted = amount * rate;
            const formattedAmount = formatAmount(amount, from);
            const formattedConverted = formatAmount(converted, to);
            const formattedRate = formatAmount(rate, to);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('💱 Currency Converter')
                .addFields(
                    { name: '📤 From', value: `${formattedAmount} ${from}`, inline: true },
                    { name: '📥 To', value: `${formattedConverted} ${to}`, inline: true },
                    { name: '📊 Exchange Rate', value: `1 ${from} = ${formattedRate} ${to}`, inline: false }
                )
                .setFooter({ text: 'Rates provided by exchangerate-api.com • Rates refresh every 10 min' })
                .setTimestamp();

            await reply.edit({ content: null, embeds: [embed] });
        } catch (error) {
            console.error('[Convert] API error:', error.message);
            const embed = new EmbedBuilder()
                .setColor('#ed4245')
                .setTitle('❌ Conversion Failed')
                .setDescription(
                    'Unable to fetch exchange rates. Please try again later.\n\n' +
                    `**Error:** \`${error.message}\``
                );
            await reply.edit({ content: null, embeds: [embed] });
        }
    }
};