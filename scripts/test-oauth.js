#!/usr/bin/env node
/**
 * Minimal OAuth 1.0a test — tests tokens against FatSecret profile.get
 * Usage: node scripts/test-oauth.js
 * (requires env vars: FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET,
 *  FATSECRET_ACCESS_TOKEN, FATSECRET_ACCESS_TOKEN_SECRET)
 */

import crypto from "crypto";

const consumerKey = process.env.FATSECRET_CLIENT_ID?.trim();
const consumerSecret = process.env.FATSECRET_CLIENT_SECRET?.trim();
const accessToken = process.env.FATSECRET_ACCESS_TOKEN?.trim();
const accessTokenSecret = process.env.FATSECRET_ACCESS_TOKEN_SECRET?.trim();

console.log("Consumer Key:", consumerKey?.slice(0, 12) + "...");
console.log("Consumer Secret:", consumerSecret?.slice(0, 6) + "...");
console.log("Access Token:", accessToken?.slice(0, 12) + "...");
console.log("Access Token Secret:", accessTokenSecret?.slice(0, 6) + "...");
console.log("Token length:", accessToken?.length, "Secret length:", accessTokenSecret?.length);
console.log("");

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

// Test 1: Try profile.get via POST with all params in body
async function testPost() {
  const baseUrl = "https://platform.fatsecret.com/rest/server.api";
  const params = {
    method: "profile.get",
    format: "json",
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // Generate signature
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const signatureBase = `POST&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;

  console.log("=== POST Test (all params in body) ===");
  console.log("Signature base string:", signatureBase.slice(0, 120) + "...");
  console.log("Signing key:", signingKey.slice(0, 20) + "...");

  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  params.oauth_signature = signature;

  const body = new URLSearchParams(params).toString();

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    console.log(`Response (${response.status}):`, text.slice(0, 300));
  } catch (e) {
    console.log("Error:", e.message);
  }
  console.log("");
}

// Test 2: Try via GET with params in query string
async function testGet() {
  const baseUrl = "https://platform.fatsecret.com/rest/server.api";
  const params = {
    method: "profile.get",
    format: "json",
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const signatureBase = `GET&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;

  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  params.oauth_signature = signature;

  const qs = new URLSearchParams(params).toString();
  const url = `${baseUrl}?${qs}`;

  console.log("=== GET Test (params in query string) ===");
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log(`Response (${response.status}):`, text.slice(0, 300));
  } catch (e) {
    console.log("Error:", e.message);
  }
  console.log("");
}

// Test 3: Use profile.create via OAuth 2.0 (app-level) to get fresh tokens
async function testProfileCreate() {
  console.log("=== OAuth 2.0 profile.create test ===");

  // First get an OAuth 2.0 token
  const tokenResponse = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials&scope=basic premier",
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    console.log("Failed to get OAuth2 token:", tokenData);
    return;
  }
  console.log("Got OAuth2 token:", tokenData.access_token.slice(0, 20) + "...");

  // Now call profile.create
  const profileResponse = await fetch("https://platform.fatsecret.com/rest/server.api", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Bearer ${tokenData.access_token}`,
    },
    body: new URLSearchParams({
      method: "profile.create",
      format: "json",
    }).toString(),
  });

  const profileText = await profileResponse.text();
  console.log(`profile.create response (${profileResponse.status}):`, profileText.slice(0, 500));
}

await testPost();
await testGet();
await testProfileCreate();
