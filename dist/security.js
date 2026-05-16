/**
 * Security utilities for the FatSecret MCP server.
 *
 * Covers: input sanitization, rate limiting, credential validation,
 * and safe error handling.
 */
// ─── Input Sanitization ────────────────────────────────────────────────────────
/**
 * Maximum allowed length for string inputs to prevent abuse.
 */
const MAX_INPUT_LENGTH = {
    food_entry_name: 200,
    search_query: 200,
    saved_meal_name: 100,
    saved_meal_description: 500,
    comment: 500,
};
/**
 * Sanitize a string input: trim, enforce length, strip control characters.
 * Does NOT strip HTML (FatSecret API handles that server-side).
 */
export function sanitizeString(input, field) {
    // Strip null bytes and control characters (except newline/tab)
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    // Trim whitespace
    sanitized = sanitized.trim();
    // Enforce max length
    const maxLen = MAX_INPUT_LENGTH[field] || 500;
    if (sanitized.length > maxLen) {
        sanitized = sanitized.slice(0, maxLen);
    }
    return sanitized;
}
/**
 * Validate that a date string is a real date and within reasonable range.
 */
export function validateDate(dateStr) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return { valid: false, error: "Date must be in YYYY-MM-DD format." };
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    // Reasonable range: 2020 to 2030
    if (year < 2020 || year > 2030) {
        return { valid: false, error: "Date year must be between 2020 and 2030." };
    }
    // Validate it's a real date
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return { valid: false, error: "Invalid date (e.g., Feb 30 does not exist)." };
    }
    return { valid: true };
}
// ─── Rate Limiting ─────────────────────────────────────────────────────────────
/**
 * Simple sliding-window rate limiter.
 * FatSecret Basic tier allows 5,000 calls/day.
 * We set a conservative limit to leave headroom.
 */
class RateLimiter {
    timestamps = [];
    maxRequests;
    windowMs;
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    /**
     * Check if a request can proceed. Returns true if allowed.
     */
    canProceed() {
        const now = Date.now();
        // Remove expired timestamps
        this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
        return this.timestamps.length < this.maxRequests;
    }
    /**
     * Record a request.
     */
    record() {
        this.timestamps.push(Date.now());
    }
    /**
     * Get remaining requests in current window.
     */
    remaining() {
        const now = Date.now();
        this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
        return Math.max(0, this.maxRequests - this.timestamps.length);
    }
    /**
     * Get time until next request slot opens (ms), or 0 if available.
     */
    retryAfterMs() {
        if (this.canProceed())
            return 0;
        const oldest = this.timestamps[0];
        return oldest + this.windowMs - Date.now();
    }
}
// 4,500 requests per 24h (leaving 500 buffer from the 5,000 limit)
export const dailyRateLimiter = new RateLimiter(4500, 24 * 60 * 60 * 1000);
// 30 requests per minute (burst protection)
export const minuteRateLimiter = new RateLimiter(30, 60 * 1000);
/**
 * Check rate limits before making a request.
 * Returns null if OK, or an error message string if rate-limited.
 */
export function checkRateLimit() {
    if (!minuteRateLimiter.canProceed()) {
        const retryMs = minuteRateLimiter.retryAfterMs();
        return `Rate limited: too many requests per minute. Retry in ${Math.ceil(retryMs / 1000)} seconds.`;
    }
    if (!dailyRateLimiter.canProceed()) {
        return `Daily API limit reached (4,500/5,000 calls used). Wait until tomorrow or upgrade to Premier.`;
    }
    return null;
}
/**
 * Record a successful API call for rate limiting.
 */
export function recordApiCall() {
    minuteRateLimiter.record();
    dailyRateLimiter.record();
}
/**
 * Validate that required environment variables are set.
 * Call at startup to fail fast.
 */
export function validateCredentials() {
    const errors = [];
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
    const accessToken = process.env.FATSECRET_ACCESS_TOKEN;
    const accessTokenSecret = process.env.FATSECRET_ACCESS_TOKEN_SECRET;
    const hasAppCredentials = !!(clientId && clientSecret);
    const hasUserCredentials = !!(accessToken && accessTokenSecret);
    if (!clientId)
        errors.push("FATSECRET_CLIENT_ID is not set");
    if (!clientSecret)
        errors.push("FATSECRET_CLIENT_SECRET is not set");
    if (!accessToken)
        errors.push("FATSECRET_ACCESS_TOKEN is not set (diary tools will fail)");
    if (!accessTokenSecret)
        errors.push("FATSECRET_ACCESS_TOKEN_SECRET is not set (diary tools will fail)");
    // Basic format validation (don't log the actual values)
    if (clientId && clientId.length < 10) {
        errors.push("FATSECRET_CLIENT_ID looks too short — verify it's correct");
    }
    if (clientSecret && clientSecret.length < 10) {
        errors.push("FATSECRET_CLIENT_SECRET looks too short — verify it's correct");
    }
    return { hasAppCredentials, hasUserCredentials, errors };
}
// ─── Safe Error Handling ───────────────────────────────────────────────────────
/**
 * Redact sensitive information from error messages.
 * Strips tokens, secrets, and credentials from any error output.
 */
export function redactSensitive(message) {
    // Redact anything that looks like a token/secret
    let redacted = message;
    // OAuth tokens (typically 20+ chars of alphanumeric)
    redacted = redacted.replace(/oauth_token=([^&\s]{10,})/gi, "oauth_token=[REDACTED]");
    redacted = redacted.replace(/oauth_signature=([^&\s]{10,})/gi, "oauth_signature=[REDACTED]");
    redacted = redacted.replace(/oauth_consumer_key=([^&\s]{10,})/gi, "oauth_consumer_key=[REDACTED]");
    // Bearer tokens
    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]");
    // Generic credential patterns in URLs/params
    redacted = redacted.replace(/client_secret=([^&\s]{5,})/gi, "client_secret=[REDACTED]");
    redacted = redacted.replace(/access_token=([^&\s]{5,})/gi, "access_token=[REDACTED]");
    // Environment variable values that might leak
    const envVars = [
        process.env.FATSECRET_CLIENT_SECRET,
        process.env.FATSECRET_ACCESS_TOKEN,
        process.env.FATSECRET_ACCESS_TOKEN_SECRET,
    ];
    for (const val of envVars) {
        if (val && val.length > 5 && redacted.includes(val)) {
            redacted = redacted.replace(new RegExp(escapeRegex(val), "g"), "[REDACTED]");
        }
    }
    return redacted;
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//# sourceMappingURL=security.js.map