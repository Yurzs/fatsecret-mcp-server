/**
 * Security utilities for the FatSecret MCP server.
 *
 * Covers: input sanitization, rate limiting, credential validation,
 * and safe error handling.
 */
/**
 * Sanitize a string input: trim, enforce length, strip control characters.
 * Does NOT strip HTML (FatSecret API handles that server-side).
 */
export declare function sanitizeString(input: string, field: string): string;
/**
 * Validate that a date string is a real date and within reasonable range.
 */
export declare function validateDate(dateStr: string): {
    valid: boolean;
    error?: string;
};
/**
 * Simple sliding-window rate limiter.
 * FatSecret Basic tier allows 5,000 calls/day.
 * We set a conservative limit to leave headroom.
 */
declare class RateLimiter {
    private timestamps;
    private readonly maxRequests;
    private readonly windowMs;
    constructor(maxRequests: number, windowMs: number);
    /**
     * Check if a request can proceed. Returns true if allowed.
     */
    canProceed(): boolean;
    /**
     * Record a request.
     */
    record(): void;
    /**
     * Get remaining requests in current window.
     */
    remaining(): number;
    /**
     * Get time until next request slot opens (ms), or 0 if available.
     */
    retryAfterMs(): number;
}
export declare const dailyRateLimiter: RateLimiter;
export declare const minuteRateLimiter: RateLimiter;
/**
 * Check rate limits before making a request.
 * Returns null if OK, or an error message string if rate-limited.
 */
export declare function checkRateLimit(): string | null;
/**
 * Record a successful API call for rate limiting.
 */
export declare function recordApiCall(): void;
export interface CredentialStatus {
    hasAppCredentials: boolean;
    hasUserCredentials: boolean;
    errors: string[];
}
/**
 * Validate that required environment variables are set.
 * Call at startup to fail fast.
 */
export declare function validateCredentials(): CredentialStatus;
/**
 * Redact sensitive information from error messages.
 * Strips tokens, secrets, and credentials from any error output.
 */
export declare function redactSensitive(message: string): string;
export {};
//# sourceMappingURL=security.d.ts.map