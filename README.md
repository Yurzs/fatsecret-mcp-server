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
3. Generate an application — you'll get a **Client ID** and **Client Secret**

### 2. Get User OAuth Tokens (3-legged OAuth 1.0a)

For diary/weight access, you need user-level tokens. The flow:

1. Request a temporary token from FatSecret
2. Redirect user to authorize at `https://www.fatsecret.com/oauth/authorize`
3. Exchange the verifier for permanent access tokens

A helper script for this is at `scripts/oauth-setup.ts` (TODO).

### 3. Environment Variables

```bash
export FATSECRET_CLIENT_ID="your_client_id"
export FATSECRET_CLIENT_SECRET="your_client_secret"
export FATSECRET_ACCESS_TOKEN="user_access_token"
export FATSECRET_ACCESS_TOKEN_SECRET="user_access_token_secret"
```

### 4. Build & Run

```bash
npm install
npm run build
npm start
```

### 5. Configure in Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fatsecret": {
      "command": "node",
      "args": ["/path/to/fatsecret-mcp-server/dist/index.js"],
      "env": {
        "FATSECRET_CLIENT_ID": "your_client_id",
        "FATSECRET_CLIENT_SECRET": "your_client_secret",
        "FATSECRET_ACCESS_TOKEN": "your_access_token",
        "FATSECRET_ACCESS_TOKEN_SECRET": "your_access_token_secret"
      }
    }
  }
}
```

## Typical Workflow

1. **Search** for a food: `fatsecret_search_food("chicken breast")`
2. **Get details** to find serving_id: `fatsecret_get_food(food_id)`
3. **Log it**: `fatsecret_create_food_entry(food_id, "Chicken Breast", serving_id, 2.5, "lunch", "2026-05-16")`
4. **Review day**: `fatsecret_get_food_entries("2026-05-16")`
5. **Track weight**: `fatsecret_update_weight(77.5, "2026-05-16")`

## API Tier

The free Basic tier (5,000 calls/day, US food database) is sufficient for personal use. Apply for Premier Free if you want barcode scanning and autocomplete.
