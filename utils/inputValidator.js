class InputValidator {
    /**
     * Validate and sanitize string input
     * @param {string} input - Input to validate
     * @param {object} options - Validation options
     * @returns {object} - { valid: boolean, value: string, error: string }
     */
    static validateString(input, options = {}) {
        const {
            required = true,
            minLength = 0,
            maxLength = 2000,
            trim = true,
            allowSpecialChars = true
        } = options;

        if (!input && required) {
            return { valid: false, error: 'Input is required' };
        }

        let value = String(input);
        if (trim) value = value.trim();

        if (value.length < minLength) {
            return { valid: false, error: `Input must be at least ${minLength} characters` };
        }

        if (value.length > maxLength) {
            return { valid: false, error: `Input cannot exceed ${maxLength} characters` };
        }

        if (!allowSpecialChars) {
            const specialCharPattern = /[<>@#&*]/;
            if (specialCharPattern.test(value)) {
                return { valid: false, error: 'Input contains invalid special characters' };
            }
        }

        return { valid: true, value };
    }

    /**
     * Validate number input
     * @param {any} input - Input to validate
     * @param {object} options - Validation options
     * @returns {object} - { valid: boolean, value: number, error: string }
     */
    static validateNumber(input, options = {}) {
        const {
            required = true,
            min = -Infinity,
            max = Infinity,
            integer = false
        } = options;

        if (input === null || input === undefined || input === '') {
            if (required) return { valid: false, error: 'Number is required' };
            return { valid: true, value: null };
        }

        const num = Number(input);

        if (isNaN(num)) {
            return { valid: false, error: 'Input must be a valid number' };
        }

        if (integer && !Number.isInteger(num)) {
            return { valid: false, error: 'Input must be an integer' };
        }

        if (num < min) {
            return { valid: false, error: `Number must be at least ${min}` };
        }

        if (num > max) {
            return { valid: false, error: `Number cannot exceed ${max}` };
        }

        return { valid: true, value: num };
    }

    /**
     * Validate boolean input
     * @param {any} input - Input to validate
     * @returns {object} - { valid: boolean, value: boolean, error: string }
     */
    static validateBoolean(input) {
        if (typeof input === 'boolean') {
            return { valid: true, value: input };
        }

        const str = String(input).toLowerCase();
        if (['true', 'yes', '1', 'on'].includes(str)) {
            return { valid: true, value: true };
        }

        if (['false', 'no', '0', 'off'].includes(str)) {
            return { valid: true, value: false };
        }

        return { valid: false, error: 'Input must be a boolean value' };
    }

    /**
     * Validate array input
     * @param {any} input - Input to validate
     * @param {object} options - Validation options
     * @returns {object} - { valid: boolean, value: array, error: string }
     */
    static validateArray(input, options = {}) {
        const {
            required = true,
            minLength = 0,
            maxLength = 100,
            itemValidator = null
        } = options;

        if (!Array.isArray(input)) {
            if (required) return { valid: false, error: 'Input must be an array' };
            return { valid: true, value: [] };
        }

        if (input.length < minLength) {
            return { valid: false, error: `Array must contain at least ${minLength} items` };
        }

        if (input.length > maxLength) {
            return { valid: false, error: `Array cannot contain more than ${maxLength} items` };
        }

        if (itemValidator) {
            for (let i = 0; i < input.length; i++) {
                const result = itemValidator(input[i]);
                if (!result.valid) {
                    return { valid: false, error: `Item at index ${i}: ${result.error}` };
                }
            }
        }

        return { valid: true, value: input };
    }

    /**
     * Validate email input
     * @param {string} input - Email to validate
     * @returns {object} - { valid: boolean, value: string, error: string }
     */
    static validateEmail(input) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!input) {
            return { valid: false, error: 'Email is required' };
        }

        const email = String(input).trim().toLowerCase();

        if (!emailRegex.test(email)) {
            return { valid: false, error: 'Invalid email format' };
        }

        if (email.length > 254) {
            return { valid: false, error: 'Email is too long' };
        }

        return { valid: true, value: email };
    }

    /**
     * Validate URL input
     * @param {string} input - URL to validate
     * @returns {object} - { valid: boolean, value: string, error: string }
     */
    static validateURL(input) {
        if (!input) {
            return { valid: false, error: 'URL is required' };
        }

        try {
            const url = new URL(input);
            return { valid: true, value: url.toString() };
        } catch (e) {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    /**
     * Validate Discord user ID
     * @param {string} input - User ID to validate
     * @returns {object} - { valid: boolean, value: string, error: string }
     */
    static validateDiscordId(input) {
        if (!input) {
            return { valid: false, error: 'Discord ID is required' };
        }

        const id = String(input).trim();
        
        // Discord IDs are numeric strings, usually 17-19 characters
        if (!/^\d{17,19}$/.test(id)) {
            return { valid: false, error: 'Invalid Discord ID format' };
        }

        return { valid: true, value: id };
    }

    /**
     * Validate duration string (e.g., "1h", "30m", "2d")
     * @param {string} input - Duration string to validate
     * @returns {object} - { valid: boolean, value: number (ms), error: string }
     */
    static validateDuration(input) {
        if (!input) {
            return { valid: false, error: 'Duration is required' };
        }

        const str = String(input).trim().toLowerCase();
        const regex = /^(\d+)([smhdw])$/;
        const match = str.match(regex);

        if (!match) {
            return { valid: false, error: 'Invalid duration format (use: 1s, 30m, 1h, 1d, 1w)' };
        }

        const [, value, unit] = match;
        const num = parseInt(value);

        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000
        };

        const ms = num * units[unit];
        return { valid: true, value: ms };
    }

    /**
     * Parse a natural-language duration string.
     * Supports: "in 10 minutes", "2 hours", "1h 30m", "1 day", "in 1 hour 30 minutes"
     * Units: second(s)/s, minute(s)/m, hour(s)/h, day(s)/d, week(s)/w
     * @param {string} input - Natural-language duration string
     * @returns {object} - { valid: boolean, value: number (ms), error: string }
     */
    static parseNaturalDuration(input) {
        if (!input) {
            return { valid: false, error: 'Duration is required' };
        }

        const MIN_MS = 1000;
        const MAX_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

        let str = String(input).trim().toLowerCase();
        // Tolerate a leading "in " keyword, e.g. "in 10 minutes"
        str = str.replace(/^in\s+/, '');

        const unitMap = {
            s: 1000,
            sec: 1000,
            secs: 1000,
            second: 1000,
            seconds: 1000,
            m: 60 * 1000,
            min: 60 * 1000,
            mins: 60 * 1000,
            minute: 60 * 1000,
            minutes: 60 * 1000,
            h: 60 * 60 * 1000,
            hr: 60 * 60 * 1000,
            hrs: 60 * 60 * 1000,
            hour: 60 * 60 * 1000,
            hours: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000,
            wk: 7 * 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            weeks: 7 * 24 * 60 * 60 * 1000
        };

        // Match repeating groups of "<number> <unit>" (unit is alphabetic, possibly the strict Nm form too)
        const tokenRegex = /(\d+)\s*([a-z]+)/g;
        let totalMs = 0;
        let matchedAny = false;
        let lastIndex = 0;
        let match;

        while ((match = tokenRegex.exec(str)) !== null) {
            matchedAny = true;
            // Ensure no garbage between matches (allow whitespace and commas/and)
            const between = str.slice(lastIndex, match.index);
            if (between && !/^[\s,]*and\s*$/i.test(between) && !/^[\s,]*$/.test(between)) {
                return { valid: false, error: `Invalid duration text near "${between.trim()}"` };
            }
            const num = parseInt(match[1], 10);
            const unit = match[2];
            const mult = unitMap[unit];
            if (!mult) {
                return { valid: false, error: `Unknown time unit "${unit}" (use seconds, minutes, hours, days, weeks)` };
            }
            totalMs += num * mult;
            lastIndex = tokenRegex.lastIndex;
        }

        // Reject trailing garbage after the last matched token
        const trailing = str.slice(lastIndex);
        if (trailing && !/^[\s,]*$/.test(trailing)) {
            return { valid: false, error: `Invalid duration text near "${trailing.trim()}"` };
        }

        if (!matchedAny || totalMs <= 0) {
            return { valid: false, error: 'Invalid duration format (e.g. "10 minutes", "2 hours", "1 day")' };
        }

        if (totalMs < MIN_MS) {
            return { valid: false, error: 'Duration must be at least 1 second' };
        }

        if (totalMs > MAX_MS) {
            return { valid: false, error: 'Duration cannot exceed 1 week' };
        }

        return { valid: true, value: totalMs };
    }

    /**
     * Sanitize text to prevent injection
     * @param {string} input - Text to sanitize
     * @returns {string} - Sanitized text
     */
    static sanitizeText(input) {
        if (!input) return '';
        
        return String(input)
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/```/g, '') // Remove code blocks
            .trim();
    }

    /**
     * Validate object against schema
     * @param {object} obj - Object to validate
     * @param {object} schema - Schema with field validators
     * @returns {object} - { valid: boolean, errors: array, data: object }
     */
    static validateObject(obj, schema) {
        const errors = [];
        const data = {};

        for (const [field, validator] of Object.entries(schema)) {
            const value = obj[field];
            const result = validator(value);

            if (!result.valid) {
                errors.push(`${field}: ${result.error}`);
            } else {
                data[field] = result.value;
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            data
        };
    }
}

module.exports = InputValidator;
