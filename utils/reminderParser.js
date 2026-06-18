const InputValidator = require('./inputValidator');

/**
 * Parse a natural-language reminder instruction.
 *
 * Accepts forms like:
 *   "me in 10 minutes to check the oven"
 *   "in 2 hours to call mom"
 *   "10 minutes check the oven"
 *   "1h 30m to finish the report"
 *   "in 1 day | pay the rent"
 *
 * @param {string} raw - The raw reminder text (without the command name)
 * @returns {object} { valid, durationMs, message, error }
 */
function parseReminderText(raw) {
    if (!raw || !String(raw).trim()) {
        return { valid: false, error: 'Please provide a reminder, e.g. `me in 10 minutes to check the oven`' };
    }

    let text = String(raw).trim();

    // Strip an optional leading "me " or "me," (natural phrasing: "remind me in ...")
    text = text.replace(/^me[\s,]+/i, '');

    // Find the duration portion: a leading run of "<number> <unit>" tokens
    // (with an optional leading "in").
    const inMatch = text.match(/^in\s+/i);
    let working = inMatch ? text.slice(inMatch[0].length) : text;

    // Greedily consume duration tokens from the start of `working`.
    const tokenRegex = /^(\d+)\s*([a-z]+)\s*/i;
    let durationStr = '';
    let consumed = '';
    let m;
    while ((m = working.match(tokenRegex)) !== null) {
        durationStr += (durationStr ? ' ' : '') + m[1] + ' ' + m[2];
        consumed += m[0];
        working = working.slice(m[0].length);
    }

    if (!durationStr) {
        return { valid: false, error: 'Could not find a duration. Example: `me in 10 minutes to check the oven`' };
    }

    const durationValidation = InputValidator.parseNaturalDuration(durationStr);
    if (!durationValidation.valid) {
        return { valid: false, error: durationValidation.error };
    }

    // The remainder is the message. Strip leading connectors like "to", "about", "that", "for".
    let message = working.trim();

    // Allow separators between duration and message: "|", ":", "to", "about", "that", "for"
    message = message.replace(/^[|:]\s*/i, '');
    message = message.replace(/^(to|about|that|for)\s+/i, '');

    if (!message) {
        return { valid: false, error: 'Please provide a reminder message, e.g. `me in 10 minutes to check the oven`' };
    }

    return {
        valid: true,
        durationMs: durationValidation.value,
        message
    };
}

module.exports = { parseReminderText };
