/**
 * FatSecret API client handling both OAuth 2.0 (app-level) and OAuth 1.0a (user-level) auth.
 *
 * - OAuth 2.0: Used for food search, food get (no user context needed)
 * - OAuth 1.0a (3-legged): Used for food diary, saved meals, weight (user context)
 */

import axios, { AxiosError } from "axios";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { API_BASE_URL, OAUTH2_TOKEN_URL } from "./constants.js";
import { checkRateLimit, recordApiCall, redactSensitive } from "./security.js";

// ─── OAuth 2.0 (Client Credentials) ───────────────────────────────────────────

let oauth2Token: string | null = null;
let oauth2Expiry: number = 0;

async function getOAuth2Token(): Promise<string> {
  const now = Date.now();
  if (oauth2Token && now < oauth2Expiry) {
    return oauth2Token;
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  // OAuth 2.0 uses its own Client Secret (separate from OAuth 1.0a Consumer Secret)
  const clientSecret = process.env.FATSECRET_OAUTH2_CLIENT_SECRET || process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing FATSECRET_CLIENT_ID or FATSECRET_OAUTH2_CLIENT_SECRET environment variables. " +
      "Register at https://platform.fatsecret.com/register to get API credentials."
    );
  }

  const response = await axios.post(
    OAUTH2_TOKEN_URL,
    "grant_type=client_credentials&scope=basic",
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      auth: { username: clientId, password: clientSecret },
    }
  );

  oauth2Token = response.data.access_token;
  // Expire 60 seconds early to be safe
  oauth2Expiry = now + (response.data.expires_in - 60) * 1000;
  return oauth2Token!;
}

/**
 * Make an OAuth 2.0 authenticated request (app-level, no user context).
 * Used for: foods.search, food.get
 */
export async function makeAppRequest<T>(
  method: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  // Rate limit check
  const rateLimitError = checkRateLimit();
  if (rateLimitError) throw new Error(rateLimitError);

  const token = await getOAuth2Token();

  const filteredParams: Record<string, string> = { format: "json" };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) filteredParams[k] = String(v);
  }

  const response = await axios.post(
    `${API_BASE_URL}/server.api`,
    new URLSearchParams({ method, ...filteredParams }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000,
    }
  );

  recordApiCall();

  // Debug: log raw response to stderr (visible in Claude Desktop MCP logs)
  console.error(`[FatSecret] ${method} response:`, JSON.stringify(response.data).slice(0, 500));

  // FatSecret can return 200 with an error body
  if (response.data?.error) {
    throw new Error(
      `FatSecret API Error (code ${response.data.error.code}): ${response.data.error.message}`
    );
  }

  return response.data as T;
}

// ─── OAuth 1.0a (3-legged, user context) ──────────────────────────────────────

/**
 * Make an OAuth 1.0a authenticated request (user-level).
 * Uses the oauth-1.0a library for reliable signature generation.
 * Used for: food diary, saved meals, weight diary, etc.
 */
export async function makeUserRequest<T>(
  method: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  // Rate limit check
  const rateLimitError = checkRateLimit();
  if (rateLimitError) throw new Error(rateLimitError);

  const consumerKey = process.env.FATSECRET_CLIENT_ID?.trim();
  // OAuth 1.0a uses Consumer Secret (separate from OAuth 2.0 Client Secret)
  const consumerSecret = (process.env.FATSECRET_CONSUMER_SECRET || process.env.FATSECRET_CLIENT_SECRET)?.trim();
  const accessToken = process.env.FATSECRET_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.FATSECRET_ACCESS_TOKEN_SECRET?.trim();

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "Missing FATSECRET_CLIENT_ID or FATSECRET_CONSUMER_SECRET environment variables."
    );
  }
  if (!accessToken || !accessTokenSecret) {
    throw new Error(
      "Missing FATSECRET_ACCESS_TOKEN or FATSECRET_ACCESS_TOKEN_SECRET environment variables. " +
      "Complete the 3-legged OAuth flow to get user tokens."
    );
  }

  const baseUrl = `${API_BASE_URL}/server.api`;

  // Build API params (non-OAuth)
  const apiParams: Record<string, string> = {
    method,
    format: "json",
  };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) apiParams[k] = String(v);
  }

  // Use oauth-1.0a library for signing
  const oauth = new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(baseString: string, key: string) {
      return crypto.createHmac("sha1", key).update(baseString).digest("base64");
    },
  });

  const requestData = {
    url: baseUrl,
    method: "POST" as const,
    data: apiParams,
  };

  const token = {
    key: accessToken,
    secret: accessTokenSecret,
  };

  const oauthData = oauth.authorize(requestData, token);
  const authHeader = oauth.toHeader(oauthData);

  console.error(`[FatSecret] ${method} OAuth1.0a request with token=${accessToken.slice(0, 8)}...`);
  console.error(`[FatSecret] Auth header: ${authHeader.Authorization.slice(0, 80)}...`);

  // OAuth params in Authorization header, API params in POST body
  const response = await axios.post(
    baseUrl,
    new URLSearchParams(apiParams).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...authHeader,
      },
      timeout: 30000,
    }
  );

  recordApiCall();

  console.error(`[FatSecret] ${method} response:`, JSON.stringify(response.data).slice(0, 500));

  // FatSecret can return 200 with an error body
  if (response.data?.error) {
    throw new Error(
      `FatSecret API Error (code ${response.data.error.code}): ${response.data.error.message}`
    );
  }

  return response.data as T;
}

// ─── Error Handling ────────────────────────────────────────────────────────────

export function handleApiError(error: unknown): string {
  let message: string;

  if (error instanceof AxiosError) {
    if (error.response) {
      const data = error.response.data;
      // FatSecret returns errors in their own format
      if (data?.error) {
        message = `FatSecret API Error (code ${data.error.code}): ${data.error.message}`;
      } else {
        switch (error.response.status) {
          case 400:
            message = "Error: Bad request. Check parameter values.";
            break;
          case 401:
            message = "Error: Authentication failed. Check your API credentials and OAuth tokens.";
            break;
          case 403:
            message = "Error: Access denied. Your API tier may not support this endpoint.";
            break;
          case 429:
            message = "Error: Rate limit exceeded. Wait before making more requests.";
            break;
          default:
            // Sanitize the response body to prevent token leakage
            message = `Error: API request failed with status ${error.response.status}.`;
            break;
        }
      }
    } else if (error.code === "ECONNABORTED") {
      message = "Error: Request timed out. Try again.";
    } else {
      message = `Error: Network error: ${error.message}`;
    }
  } else {
    message = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  // Always redact before returning to client
  return redactSensitive(message);
}
