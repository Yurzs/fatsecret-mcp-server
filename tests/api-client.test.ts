import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleApiError } from "../src/api-client.js";
import { AxiosError, AxiosHeaders } from "axios";

describe("handleApiError", () => {
  it("handles FatSecret-format errors", () => {
    const error = new AxiosError("Request failed");
    error.response = {
      status: 400,
      statusText: "Bad Request",
      data: { error: { code: 106, message: "Invalid ID: food_id" } },
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const result = handleApiError(error);
    expect(result).toContain("code 106");
    expect(result).toContain("Invalid ID");
  });

  it("handles 401 without leaking tokens", () => {
    const error = new AxiosError("Request failed");
    error.response = {
      status: 401,
      statusText: "Unauthorized",
      data: { message: "oauth_token=secret123abc is invalid" },
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const result = handleApiError(error);
    expect(result).toContain("Authentication failed");
    expect(result).not.toContain("secret123abc");
  });

  it("handles 429 rate limit", () => {
    const error = new AxiosError("Request failed");
    error.response = {
      status: 429,
      statusText: "Too Many Requests",
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const result = handleApiError(error);
    expect(result).toContain("Rate limit");
  });

  it("handles timeout", () => {
    const error = new AxiosError("timeout of 30000ms exceeded");
    error.code = "ECONNABORTED";

    const result = handleApiError(error);
    expect(result).toContain("timed out");
  });

  it("handles unknown errors without crashing", () => {
    expect(handleApiError("string error")).toContain("string error");
    expect(handleApiError(new Error("generic"))).toContain("generic");
    expect(handleApiError(null)).toContain("null");
    expect(handleApiError(undefined)).toContain("undefined");
  });

  it("does not expose raw response body for unexpected status codes", () => {
    const error = new AxiosError("Request failed");
    error.response = {
      status: 500,
      statusText: "Internal Server Error",
      data: { internal_secret: "leaked_token_12345" },
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const result = handleApiError(error);
    // Should NOT contain the raw response body
    expect(result).not.toContain("leaked_token_12345");
    expect(result).toContain("status 500");
  });
});
