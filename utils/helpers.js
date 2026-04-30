// Helper function to parse duration from string (e.g., "3:45" to seconds)
function parseDuration(duration) {
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return 0;
}

// Helper function to format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to format large numbers (K/M/B/T/Q)
function formatNumber(num) {
    if (typeof num !== 'number' || num < 0) return '0';
    
    const tiers = [
        { size: 1e18, suffix: 'Qn' }, // Quintillion
        { size: 1e15, suffix: 'Q' },  // Quadrillion
        { size: 1e12, suffix: 'T' },  // Trillion
        { size: 1e9, suffix: 'B' },   // Billion
        { size: 1e6, suffix: 'M' },   // Million
        { size: 1e3, suffix: 'K' }    // Thousand
    ];
    
    for (const tier of tiers) {
        if (num >= tier.size) {
            const value = num / tier.size;
            const decimals = value >= 100 ? 0 : 1;
            return value.toFixed(decimals).replace(/\.0$/, '') + tier.suffix;
        }
    }
    
    return num.toString();
}

function parseFlexibleDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const normalized = value > 0 && value < 1e12 ? value * 1000 : value;
        const parsed = new Date(normalized);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        if (/^\d+$/.test(trimmed)) {
            return parseFlexibleDate(Number(trimmed));
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function toDateObject(value, fallback = Date.now()) {
    const parsed = parseFlexibleDate(value);
    if (parsed) return parsed;

    const fallbackDate = parseFlexibleDate(fallback);
    return fallbackDate || new Date();
}

function toEpochMs(value, fallback = 0) {
    return toDateObject(value, fallback).getTime();
}

function formatDateLabel(value, { fallbackLabel = 'Not available', locale, formatOptions } = {}) {
    const parsed = parseFlexibleDate(value);
    return parsed ? parsed.toLocaleString(locale, formatOptions) : fallbackLabel;
}

module.exports = {
    parseDuration,
    formatDuration,
    formatNumber,
    parseFlexibleDate,
    toDateObject,
    toEpochMs,
    formatDateLabel
};
