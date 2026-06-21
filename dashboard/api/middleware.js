/**
 * API Middleware – authentication, rate-limiting, and standard error handling.
 */

'use strict';

const apiKeys = require('./apiKeys');

// ── In-memory rate limiter ─────────────────────────────────────────────────
const rateLimitBuckets = new Map();

/**
 * Simple sliding-window rate limiter.
 * @param {object} opts
 * @param {number} opts.windowMs  – window size in milliseconds (default 60 000)
 * @param {number} opts.maxRequests – max requests per window (default 60)
 */
function rateLimiter({ windowMs = 60_000, maxRequests = 60 } = {}) {
    return (req, res, next) => {
        const key = req.apiKeyData?.key || req.ip;
        const now = Date.now();
        let bucket = rateLimitBuckets.get(key);

        if (!bucket || now - bucket.windowStart > windowMs) {
            bucket = { windowStart: now, count: 0 };
            rateLimitBuckets.set(key, bucket);
        }

        bucket.count++;

        const remaining = Math.max(0, maxRequests - bucket.count);
        const resetAt = new Date(bucket.windowStart + windowMs).toISOString();

        res.set('X-RateLimit-Limit', String(maxRequests));
        res.set('X-RateLimit-Remaining', String(remaining));
        res.set('X-RateLimit-Reset', resetAt);

        if (bucket.count > maxRequests) {
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter: Math.ceil((bucket.windowStart + windowMs - now) / 1000)
            });
        }

        next();
    };
}

// ── API key authentication middleware ───────────────────────────────────────
/**
 * Authenticate via header `Authorization: Bearer <key>` or query `?api_key=<key>`.
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const queryKey = req.query?.api_key || null;
    const key = bearerKey || queryKey;

    if (!key) {
        return res.status(401).json({
            error: 'Missing API key',
            message: 'Provide an API key via Authorization: Bearer <key> header or ?api_key query parameter.'
        });
    }

    const keyData = apiKeys.validate(key);
    if (!keyData) {
        return res.status(403).json({
            error: 'Invalid API key',
            message: 'The provided API key is not valid.'
        });
    }

    apiKeys.recordUsage(key);
    req.apiKeyData = keyData;
    next();
}

/**
 * Require a specific scope.
 */
function requireScope(scope) {
    return (req, res, next) => {
        if (!apiKeys.hasScope(req.apiKeyData, scope)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This endpoint requires the '${scope}' scope.`
            });
        }
        next();
    };
}

/**
 * Require access to a specific guild (reads :guildId param).
 */
function requireGuildAccess(req, res, next) {
    const guildId = req.params.guildId;
    if (guildId && !apiKeys.hasGuildAccess(req.apiKeyData, guildId)) {
        return res.status(403).json({
            error: 'Access denied',
            message: 'Your API key does not have access to this guild.'
        });
    }
    next();
}

/**
 * Standard async error wrapper.
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Global error handler for API routes.
 */
function errorHandler(err, req, res, _next) {
    console.error(`[API Error] ${req.method} ${req.path}:`, err.message || err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        error: err.message || 'Internal server error',
        status
    });
}

// Periodically clean up stale rate-limit buckets (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitBuckets) {
        if (now - bucket.windowStart > 300_000) {
            rateLimitBuckets.delete(key);
        }
    }
}, 300_000).unref();

module.exports = {
    rateLimiter,
    authenticate,
    requireScope,
    requireGuildAccess,
    asyncHandler,
    errorHandler
};