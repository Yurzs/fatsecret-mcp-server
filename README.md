# FatSecret MCP Server

MCP server for managing your food diary, nutrition tracking, meal planning, and weight logging via the FatSecret Platform API.

## Tools Available

| Tool | Description |
|------|-------------|
| `fatsecret_search_food` | Search food database by name |
| `fatsecret_get_food` | Get full nutrition details for a food |
| `fatsecret_create_food_entry` | Log food to diary |
| `fatsecret_edit_food_entry` | Edit existing diary entry |
| `fatsecret_delete_food_entry` | Delete diary entry |
| `fatsecret_get_food_entries` | Get all entries for a date |
| `fatsecret_get_food_entries_month` | Monthly diary summary |
| `fatsecret_create_saved_meal` | Create reusable meal template |
| `fatsecret_add_food_to_saved_meal` | Add food to a saved meal |
| `fatsecret_get_saved_meals` | List saved meal templates |
| `fatsecret_copy_saved_meal_to_diary` | Paste saved meal into diary |
| `fatsecret_update_weight` | Log weight for a date |
| `fatsecret_get_weights_month` | Monthly weight history |
| `fatsecret_get_recently_eaten` | Recently logged foods |
| `fatsecret_copy_day` | Copy all entries between dates |

## Setup

### 1. Register for FatSecret API

1. Go to https://platform.fatsecret.com/register
2. Create a developer account
3. Note your IP address and add it to the IP whitelist on the developer dashboard (required for OAuth 2.0 — can take up to 24h to propagate)

### 2. Get API Credentials

FatSecret uses **separate credentials** for OAuth 1.0a and OAuth 2.0:

On your [developer dashboard](https://platform.fatsecret.com/), you'll find two credential sections:

| Section | Key | Secret | Used for |
|---------|-----|--------|----------|
| **REST API OAuth 1.0 Credentials** | Consumer Key | Consumer Secret | Food diary, weight, saved meals (user-level access) |
| **OAuth 2.0 Credentials** | Client ID | Client Secret | Food search, food details (app-level access) |

The Consumer Key and Client ID are the same value. The **secrets are different** — this is a common source of confusion.

### 3. Get User OAuth Tokens (3-legged OAuth 1.0a)

For diary and weight tools, you need user-level access tokens. Run the included setup script:

```bash
FATSECRET_CLIENT_ID=your_consumer_key \
FATSECRET_CLIENT_SECRET=your_consumer_secret \
node scripts/oauth-setup.js
```

This will:
1. Start a local web server at `http://localhost:9876`
2. Open your browser to authorize with FatSecret
3. Complete the OAuth 1.0a 3-legged flow
4. Display your `FATSECRET_ACCESS_TOKEN` and `FATSECRET_ACCESS_TOKEN_SECRET`

**Note:** The OAuth flow uses `authentication.fatsecret.com` (not `www.fatsecret.com`). You must log in with a FatSecret user account (the same one you use in the FatSecret mobile app), not your developer account.

### 4. Environment Variables

```bash
# Required — same value, shown as "Consumer Key" / "Client ID"
export FATSECRET_CLIENT_ID="your_consumer_key"

# OAuth 1.0a Consumer Secret (from "REST API OAuth 1.0 Credentials")
# Used for: diary, weight, saved meals, recently eaten
export FATSECRET_CONSUMER_SECRET="your_consumer_secret"

# OAuth 2.0 Client Secret (from "OAuth 2.0 Credentials")
# Used for: food search, food details
export FATSECRET_OAUTH2_CLIENT_SECRET="your_oauth2_client_secret"

# User tokens from the 3-legged OAuth flow (step 3)
export FATSECRET_ACCESS_TOKEN="your_access_token"
export FATSECRET_ACCESS_TOKEN_SECRET="your_access_token_secret"
```

**Legacy fallback:** If you set `FATSECRET_CLIENT_SECRET` instead of the two separate secrets, it will be used for both OAuth flows. This only works if your Consumer Secret and Client Secret happen to be the same value (they aren't on most accounts).

### 5. Build & Run

```bash
npm install
npm run build
npm start
```

### 6. Configure in Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fatsecret": {
      "command": "node",
      "args": ["/path/to/fatsecret-mcp-server/dist/index.js"],
      "env": {
        "FATSECRET_CLIENT_ID": "your_consumer_key",
        "FATSECRET_CONSUMER_SECRET": "your_oauth1_consumer_secret",
        "FATSECRET_OAUTH2_CLIENT_SECRET": "your_oauth2_client_secret",
        "FATSECRET_ACCESS_TOKEN": "your_access_token",
        "FATSECRET_ACCESS_TOKEN_SECRET": "your_access_token_secret"
      }
    }
  }
}
```

Or install directly from GitHub (no local clone needed):

```json
{
  "mcpServers": {
    "fatsecret": {
      "command": "npx",
      "args": ["-y", "github:Yurzs/fatsecret-mcp-server"],
      "env": { ... }
    }
  }
}
```

## Typical Workflow

1. **Search** for a food: `fatsecret_search_food("chicken breast")`
2. **Get details** to find serving_id: `fatsecret_get_food(food_id)`
3. **Log it**: `fatsecret_create_food_entry(food_id, "Chicken Breast", serving_id, 2.5, "lunch")`
4. **Review day**: `fatsecret_get_food_entries("2026-05-16")`
5. **Track weight**: `fatsecret_update_weight(77.5, "2026-05-16")`

## Troubleshooting

**"Invalid IP address detected"** — Add your public IP to the whitelist at https://platform.fatsecret.com. Propagation can take minutes to hours.

**"Invalid signature" on OAuth 1.0a requests** — You're likely using the OAuth 2.0 Client Secret instead of the OAuth 1.0a Consumer Secret. These are different values on most accounts. Check the "REST API OAuth 1.0 Credentials" section on your dashboard.

**OAuth setup can't log in** — The authorization page at `authentication.fatsecret.com` requires a FatSecret user account (the mobile app account), not your developer account. If you signed up via Apple/Google, do a password reset to set a native password.

## API Tier

The free Basic tier (5,000 calls/day) is sufficient for personal use. Apply for Premier Free if you want barcode scanning and autocomplete.
