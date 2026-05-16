#!/usr/bin/env node
/**
 * FatSecret OAuth 1.0a Setup — Local Web Server
 *
 * Endpoints per docs (https://platform.fatsecret.com/docs/guides/authentication/oauth1/three-legged):
 *   Request Token: POST https://authentication.fatsecret.com/oauth/request_token
 *   Authorize:     GET  https://authentication.fatsecret.com/oauth/authorize
 *   Access Token:  GET  https://authentication.fatsecret.com/oauth/access_token
 */

import crypto from "crypto";
import { exec } from "child_process";
import http from "http";

const REQUEST_TOKEN_URL = "https://authentication.fatsecret.com/oauth/request_token";
const AUTHORIZE_URL = "https://authentication.fatsecret.com/oauth/authorize";
const ACCESS_TOKEN_URL = "https://authentication.fatsecret.com/oauth/access_token";
const CALLBACK_PORT = 9876;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

const consumerKey = process.argv[2] || process.env.FATSECRET_CLIENT_ID;
const consumerSecret = process.argv[3] || process.env.FATSECRET_CLIENT_SECRET;

if (!consumerKey || !consumerSecret) {
  console.error("Error: Provide FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET");
  process.exit(1);
}

// ─── OAuth 1.0a Helpers ─────────────────────────────────────────────────────

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function generateSignature(method, url, params, consumerSec, tokenSec = "") {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(consumerSec)}&${percentEncode(tokenSec)}`;
  return crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
}

// ─── State ───────────────────────────────────────────────────────────────────

let requestTokenSecret = "";

// ─── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><title>FatSecret OAuth Setup</title>
      <style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;line-height:1.6}
      .btn{display:inline-block;padding:12px 24px;background:#4CAF50;color:white;text-decoration:none;border-radius:6px;font-size:16px;margin-top:16px}
      .btn:hover{background:#45a049}</style></head>
      <body><h1>FatSecret OAuth Setup</h1>
      <p>Click below to connect your FatSecret account to the MCP server.</p>
      <a class="btn" href="/start">Authorize with FatSecret</a></body></html>`);
    return;
  }

  if (url.pathname === "/start") {
    try {
      // Step 1: Get request token (POST to authentication.fatsecret.com)
      const params = {
        oauth_callback: CALLBACK_URL,
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_version: "1.0",
      };
      params.oauth_signature = generateSignature("POST", REQUEST_TOKEN_URL, params, consumerSecret);

      console.log("[oauth-setup] Step 1: Requesting token...");
      const body = new URLSearchParams(params).toString();

      const response = await fetch(REQUEST_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const responseText = await response.text();
      console.log(`[oauth-setup] Response (${response.status}):`, responseText.slice(0, 300));

      if (!response.ok) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Error getting request token</h1><p>HTTP ${response.status}</p>
          <pre>${responseText.slice(0, 500)}</pre><p><a href="/">Try again</a></p>`);
        return;
      }

      const parsed = Object.fromEntries(new URLSearchParams(responseText));

      if (!parsed.oauth_token) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>No token in response</h1><pre>${responseText}</pre><p><a href="/">Try again</a></p>`);
        return;
      }

      requestTokenSecret = parsed.oauth_token_secret || "";

      // Step 2: Redirect user to authorize
      const authUrl = `${AUTHORIZE_URL}?oauth_token=${parsed.oauth_token}`;
      console.log(`[oauth-setup] Step 2: Redirecting to authorization...`);
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (err) {
      console.error("[oauth-setup] Error:", err.message);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>Error</h1><pre>${err.message}</pre><p><a href="/">Try again</a></p>`);
    }
    return;
  }

  if (url.pathname === "/callback") {
    const oauthToken = url.searchParams.get("oauth_token");
    const oauthVerifier = url.searchParams.get("oauth_verifier");

    if (!oauthToken || !oauthVerifier) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>Error</h1><p>Missing oauth_token or oauth_verifier.</p><p><a href="/">Start over</a></p>`);
      return;
    }

    try {
      // Step 3: Exchange for access token (GET per FatSecret docs)
      const params = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: oauthToken,
        oauth_verifier: oauthVerifier,
        oauth_version: "1.0",
      };
      params.oauth_signature = generateSignature(
        "GET", ACCESS_TOKEN_URL, params, consumerSecret, requestTokenSecret
      );

      // GET request with params in query string
      const qs = new URLSearchParams(params).toString();
      const accessUrl = `${ACCESS_TOKEN_URL}?${qs}`;

      console.log("[oauth-setup] Step 3: Exchanging for access token...");
      const response = await fetch(accessUrl, { method: "GET" });

      const responseText = await response.text();
      console.log(`[oauth-setup] Response (${response.status}):`, responseText.slice(0, 300));

      if (!response.ok) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Error getting access token</h1><p>HTTP ${response.status}</p>
          <pre>${responseText.slice(0, 500)}</pre><p><a href="/">Try again</a></p>`);
        return;
      }

      const parsed = Object.fromEntries(new URLSearchParams(responseText));

      if (!parsed.oauth_token) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Error</h1><pre>${responseText}</pre><p><a href="/">Start over</a></p>`);
        return;
      }

      const accessToken = parsed.oauth_token;
      const accessTokenSecret = parsed.oauth_token_secret;

      console.log("\n===== SUCCESS =====");
      console.log(`FATSECRET_ACCESS_TOKEN=${accessToken}`);
      console.log(`FATSECRET_ACCESS_TOKEN_SECRET=${accessTokenSecret}`);
      console.log("===================\n");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html><head><title>Success!</title>
        <style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;line-height:1.6}
        .success{background:#e8f5e9;border:1px solid #4CAF50;padding:20px;border-radius:8px;margin:20px 0}
        .tokens{background:#263238;color:#aed581;padding:16px;border-radius:8px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;user-select:all}</style></head>
        <body><h1>Authorization Complete!</h1>
        <div class="success"><p>Your FatSecret account is now linked.</p></div>
        <p>Add these to your Claude Desktop MCP config env:</p>
        <div class="tokens">FATSECRET_ACCESS_TOKEN=${accessToken}
FATSECRET_ACCESS_TOKEN_SECRET=${accessTokenSecret}</div>
        <p style="margin-top:16px;color:#666">You can close this tab and stop the server (Ctrl+C).</p></body></html>`);

      setTimeout(() => process.exit(0), 5000);
    } catch (err) {
      console.error("[oauth-setup] Error:", err.message);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>Error</h1><pre>${err.message}</pre><p><a href="/">Start over</a></p>`);
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(CALLBACK_PORT, () => {
  const url = `http://localhost:${CALLBACK_PORT}`;
  console.log(`\nFatSecret OAuth Setup`);
  console.log(`Opening: ${url}\n`);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`);
});
