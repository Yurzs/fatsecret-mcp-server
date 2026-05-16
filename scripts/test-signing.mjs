import crypto from "crypto";

const k = process.env.FATSECRET_CLIENT_ID?.trim();
const s = process.env.FATSECRET_CLIENT_SECRET?.trim();
const at = process.env.FATSECRET_ACCESS_TOKEN?.trim();
const ats = process.env.FATSECRET_ACCESS_TOKEN_SECRET?.trim();
const url = "https://platform.fatsecret.com/rest/server.api";

if (!k || !s) {
  console.error("Set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET env vars");
  process.exit(1);
}

function pe(str) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function sign(method, baseUrl, params, consumerSecret, tokenSecret = "") {
  const sorted = Object.keys(params).sort().map(k => `${pe(k)}=${pe(params[k])}`).join("&");
  const base = `${method}&${pe(baseUrl)}&${pe(sorted)}`;
  const key = `${pe(consumerSecret)}&${pe(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

// Test 1: 2-legged OAuth (no user token) — foods.search
console.log("=== Test 1: 2-legged OAuth (consumer only) ===");
{
  const params = {
    method: "foods.search",
    search_expression: "chicken",
    format: "json",
    max_results: "2",
    oauth_consumer_key: k,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  params.oauth_signature = sign("POST", url, params, s);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await resp.text();
  console.log(`Status: ${resp.status}`);
  console.log(`Response: ${text.slice(0, 200)}`);
  console.log(text.includes('"foods"') ? ">>> SIGNING WORKS" : ">>> SIGNING BROKEN");
}

console.log("");

// Test 2: 3-legged OAuth (with user token) — food_entries.get.v2
console.log("=== Test 2: 3-legged OAuth (with user token) ===");
{
  const params = {
    method: "food_entries.get.v2",
    format: "json",
    oauth_consumer_key: k,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: at,
    oauth_version: "1.0",
  };
  params.oauth_signature = sign("POST", url, params, s, ats);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await resp.text();
  console.log(`Status: ${resp.status}`);
  console.log(`Response: ${text.slice(0, 200)}`);
}
