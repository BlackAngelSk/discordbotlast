const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetch } = require('undici');

// Share the same cache as the prefix command if loaded in the same process
// (each module gets its own copy, but both will benefit from API response caching at the CDN level)
const rateCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Currencies that don't use decimal places
const ZERO_DECIMAL_CURRENCIES = new Set([
    'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'KWD', 'BHD', 'OMR', 'PYG',
    'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF'
]);

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('convert')
        .setDescription('Convert between currencies (e.g., 100 USD to EUR)')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('The amount to convert')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option
                .setName('from')
                .setDescription('Source currency code (e.g., USD)')
                .setRequired(true)
                .setMaxLength(3)
                .setMinLength(3)
        )
        .addStringOption(option =>
            option
                .setName('to')
                .setDescription('Target currency code (e.g., EUR)')
                .setRequired(true)
                .setMaxLength(3)
                .setMinLength(3)
        ),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const from = interaction.options.getString('from').toUpperCase();
        const to = interaction.options.getString('to').toUpperCase();

        // Validate currency codes
        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
            const embed = new EmbedBuilder()
                .setColor('#ed4245')
                .setTitle('❌ Invalid Currency Code')
                .setDescription(
                    'Currency codes must be 3-letter ISO codes (e.g., USD, EUR, GBP).'
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (from === to) {
            const embed = new EmbedBuilder()
                .setColor('#ed4245')
                .setTitle('❌ Same Currency')
                .setDescription('Source and target currencies must be different.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

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
                return interaction.editReply({ embeds: [embed] });
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

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[Convert] API error:', error.message);
            const embed = new EmbedBuilder()
                .setColor('#ed4245')
                .setTitle('❌ Conversion Failed')
                .setDescription(
                    'Unable to fetch exchange rates. Please try again later.\n\n' +
                    `**Error:** \`${error.message}\``
                );
            await interaction.editReply({ embeds: [embed] });
        }
    }
};