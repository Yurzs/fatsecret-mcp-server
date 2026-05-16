import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sanitizeString,
  validateDate,
  checkRateLimit,
  recordApiCall,
  redactSensitive,
  validateCredentials,
  dailyRateLimiter,
  minuteRateLimiter,
} from "../src/security.js";

describe("sanitizeString", () => {
  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ", "food_entry_name")).toBe("hello");
  });

  it("strips null bytes", () => {
    expect(sanitizeString("chicken\x00breast", "food_entry_name")).toBe("chickenbreast");
  });

  it("strips control characters but keeps spaces and newlines", () => {
    expect(sanitizeString("hello\x01\x02world", "food_entry_name")).toBe("helloworld");
  });

  it("enforces max length for food_entry_name (200)", () => {
    const long = "a".repeat(300);
    const result = sanitizeString(long, "food_entry_name");
    expect(result.length).toBe(200);
  });

  it("enforces max length for search_query (200)", () => {
    const long = "b".repeat(250);
    const result = sanitizeString(long, "search_query");
    expect(result.length).toBe(200);
  });

  it("uses default max (500) for unknown fields", () => {
    const long = "c".repeat(600);
    const result = sanitizeString(long, "unknown_field");
    expect(result.length).toBe(500);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeString("   ", "food_entry_name")).toBe("");
  });

  it("preserves unicode characters", () => {
    expect(sanitizeString("ไก่ย่าง (grilled chicken)", "food_entry_name"))
      .toBe("ไก่ย่าง (grilled chicken)");
  });
});

describe("validateDate", () => {
  it("accepts valid dates", () => {
    expect(validateDate("2026-05-16")).toEqual({ valid: true });
    expect(validateDate("2026-01-01")).toEqual({ valid: true });
    expect(validateDate("2026-12-31")).toEqual({ valid: true });
  });

  it("rejects invalid format", () => {
    expect(validateDate("16-05-2026").valid).toBe(false);
    expect(validateDate("2026/05/16").valid).toBe(false);
    expect(validateDate("yesterday").valid).toBe(false);
  });

  it("rejects dates outside reasonable range", () => {
    expect(validateDate("2019-01-01").valid).toBe(false);
    expect(validateDate("2031-01-01").valid).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(validateDate("2026-02-30").valid).toBe(false);
    expect(validateDate("2026-13-01").valid).toBe(false);
    expect(validateDate("2026-00-01").valid).toBe(false);
  });

  it("accepts leap day on leap year", () => {
    expect(validateDate("2024-02-29")).toEqual({ valid: true });
  });

  it("rejects leap day on non-leap year", () => {
    expect(validateDate("2026-02-29").valid).toBe(false);
  });
});

describe("redactSensitive", () => {
  it("redacts Bearer tokens", () => {
    const msg = "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6abc123";
    expect(redactSensitive(msg)).toContain("[REDACTED]");
    expect(redactSensitive(msg)).not.toContain("eyJhbGciOiJSUzI1NiIsImtpZCI6abc123");
  });

  it("redacts oauth_token params", () => {
    const msg = "oauth_token=abc123def456ghi789&other=value";
    expect(redactSensitive(msg)).toContain("oauth_token=[REDACTED]");
    expect(redactSensitive(msg)).not.toContain("abc123def456ghi789");
  });

  it("redacts oauth_signature params", () => {
    const msg = "oauth_signature=sAyYTJiIxOGkvFpBcH8L%2BlFQRCQ%3D";
    expect(redactSensitive(msg)).toContain("oauth_signature=[REDACTED]");
  });

  it("redacts oauth_consumer_key params", () => {
    const msg = "oauth_consumer_key=9a1a6fd1fff5433f9dd77daa4587bf5d";
    expect(redactSensitive(msg)).toContain("oauth_consumer_key=[REDACTED]");
  });

  it("redacts client_secret params", () => {
    const msg = "client_secret=supersecretvalue123";
    expect(redactSensitive(msg)).toContain("client_secret=[REDACTED]");
  });

  it("leaves non-sensitive content untouched", () => {
    const msg = "Error: Food not found for ID 12345";
    expect(redactSensitive(msg)).toBe(msg);
  });

  it("redacts env var values if they appear in message", () => {
    const originalEnv = process.env.FATSECRET_CLIENT_SECRET;
    process.env.FATSECRET_CLIENT_SECRET = "my_super_secret_key_12345";

    const msg = "Request failed: my_super_secret_key_12345 was rejected";
    expect(redactSensitive(msg)).toContain("[REDACTED]");
    expect(redactSensitive(msg)).not.toContain("my_super_secret_key_12345");

    // Restore
    if (originalEnv) process.env.FATSECRET_CLIENT_SECRET = originalEnv;
    else delete process.env.FATSECRET_CLIENT_SECRET;
  });
});

describe("validateCredentials", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
  });

  it("reports missing app credentials", () => {
    delete process.env.FATSECRET_CLIENT_ID;
    delete process.env.FATSECRET_CLIENT_SECRET;
    const result = validateCredentials();
    expect(result.hasAppCredentials).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports missing user credentials", () => {
    process.env.FATSECRET_CLIENT_ID = "valid_client_id_123";
    process.env.FATSECRET_CLIENT_SECRET = "valid_client_secret_456";
    delete process.env.FATSECRET_ACCESS_TOKEN;
    delete process.env.FATSECRET_ACCESS_TOKEN_SECRET;

    const result = validateCredentials();
    expect(result.hasAppCredentials).toBe(true);
    expect(result.hasUserCredentials).toBe(false);
  });

  it("warns on suspiciously short credentials", () => {
    process.env.FATSECRET_CLIENT_ID = "short";
    process.env.FATSECRET_CLIENT_SECRET = "s";
    const result = validateCredentials();
    expect(result.errors.some((e) => e.includes("too short"))).toBe(true);
  });

  it("passes with valid credentials", () => {
    process.env.FATSECRET_CLIENT_ID = "valid_client_id_1234567890";
    process.env.FATSECRET_CLIENT_SECRET = "valid_client_secret_1234567890";
    process.env.FATSECRET_ACCESS_TOKEN = "valid_access_token_1234567890";
    process.env.FATSECRET_ACCESS_TOKEN_SECRET = "valid_access_token_secret_1234567890";

    const result = validateCredentials();
    expect(result.hasAppCredentials).toBe(true);
    expect(result.hasUserCredentials).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("Rate limiting", () => {
  it("allows requests within limit", () => {
    // Fresh state — should allow
    const result = checkRateLimit();
    expect(result).toBeNull();
  });

  it("records calls and tracks count", () => {
    const remaining = minuteRateLimiter.remaining();
    recordApiCall();
    expect(minuteRateLimiter.remaining()).toBe(remaining - 1);
  });
});
