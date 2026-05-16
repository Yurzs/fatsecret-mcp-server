#!/usr/bin/env node
/**
 * FatSecret MCP Server
 *
 * Provides tools for food diary management, nutrition tracking, meal planning,
 * and weight logging via the FatSecret Platform API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { makeAppRequest, makeUserRequest, handleApiError } from "./api-client.js";
import {
  dateStringToFatSecretInt,
  fatSecretIntToDateString,
  todayAsFatSecretInt,
  VALID_MEALS,
  CHARACTER_LIMIT,
} from "./constants.js";
import {
  sanitizeString,
  validateDate,
  validateCredentials,
} from "./security.js";

// ─── Server Init ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "fatsecret-mcp-server",
  version: "1.0.0",
});

// ─── Tool: Search Food ─────────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_search_food",
  {
    title: "Search FatSecret Food Database",
    description: `Search the FatSecret food database by name. Returns food items with basic nutrition info per serving. Use this to find food_id and serving_id needed for logging diary entries.

Args:
  - query: Food name to search (e.g., "chicken breast", "jasmine rice")
  - page: Page number for pagination (default: 0)
  - max_results: Results per page, max 50 (default: 20)

Returns: List of foods with id, name, description (brief nutrition summary).`,
    inputSchema: {
      query: z.string().min(1).describe("Food name to search for"),
      page: z.number().int().min(0).default(0).describe("Page number (0-indexed)"),
      max_results: z.number().int().min(1).max(50).default(20).describe("Results per page"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ query, page, max_results }) => {
    try {
      const data = await makeAppRequest<any>("foods.search", {
        search_expression: query,
        page_number: page,
        max_results,
      });

      const foods = data?.foods?.food;
      if (!foods || (Array.isArray(foods) && foods.length === 0)) {
        return { content: [{ type: "text", text: `No foods found for "${query}".` }] };
      }

      const foodList = Array.isArray(foods) ? foods : [foods];
      const totalResults = data?.foods?.total_results || foodList.length;

      const lines = [`# Food Search: "${query}"`, `Found ${totalResults} results (page ${page})`, ""];
      for (const food of foodList) {
        lines.push(`## ${food.food_name} (ID: ${food.food_id})`);
        if (food.brand_name) lines.push(`Brand: ${food.brand_name}`);
        lines.push(`${food.food_description}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Food Details ────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_get_food",
  {
    title: "Get Food Nutrition Details",
    description: `Get detailed nutrition information for a specific food by its food_id. Returns all available servings with full macro and micronutrient breakdown.

Use this after fatsecret_search_food to get the serving_id and nutrition data needed for logging.

Args:
  - food_id: The FatSecret food ID (from search results)

Returns: Food name, servings list with serving_id, serving description, calories, protein, carbs, fat, and available micronutrients.`,
    inputSchema: {
      food_id: z.number().int().describe("FatSecret food ID"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ food_id }) => {
    try {
      const data = await makeAppRequest<any>("food.get.v4", { food_id });

      const food = data?.food;
      if (!food) {
        return { content: [{ type: "text", text: `Food ID ${food_id} not found.` }] };
      }

      const servings = food.servings?.serving;
      const servingList = Array.isArray(servings) ? servings : servings ? [servings] : [];

      const lines = [
        `# ${food.food_name}`,
        food.brand_name ? `Brand: ${food.brand_name}` : "",
        food.food_type ? `Type: ${food.food_type}` : "",
        "",
        `## Servings (${servingList.length} options)`,
        "",
      ];

      for (const s of servingList) {
        lines.push(`### ${s.serving_description} (serving_id: ${s.serving_id})`);
        lines.push(`- **Calories**: ${s.calories} kcal`);
        lines.push(`- **Protein**: ${s.protein} g`);
        lines.push(`- **Carbs**: ${s.carbohydrate} g`);
        lines.push(`- **Fat**: ${s.fat} g`);
        if (s.fiber) lines.push(`- Fiber: ${s.fiber} g`);
        if (s.sugar) lines.push(`- Sugar: ${s.sugar} g`);
        if (s.saturated_fat) lines.push(`- Saturated Fat: ${s.saturated_fat} g`);
        if (s.sodium) lines.push(`- Sodium: ${s.sodium} mg`);
        if (s.potassium) lines.push(`- Potassium: ${s.potassium} mg`);
        if (s.cholesterol) lines.push(`- Cholesterol: ${s.cholesterol} mg`);
        if (s.calcium) lines.push(`- Calcium: ${s.calcium} mg`);
        if (s.iron) lines.push(`- Iron: ${s.iron} mg`);
        if (s.vitamin_a) lines.push(`- Vitamin A: ${s.vitamin_a} mcg`);
        if (s.vitamin_c) lines.push(`- Vitamin C: ${s.vitamin_c} mg`);
        lines.push(`- Metric: ${s.metric_serving_amount || "N/A"} ${s.metric_serving_unit || ""}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Create Food Entry ───────────────────────────────────────────────────

server.registerTool(
  "fatsecret_create_food_entry",
  {
    title: "Log Food to Diary",
    description: `Create a food diary entry for the user. Logs a specific food + serving to a meal on a given date.

You need food_id and serving_id from fatsecret_search_food / fatsecret_get_food.

Args:
  - food_id: FatSecret food ID
  - food_entry_name: Display name (e.g., "Chicken Breast")
  - serving_id: The serving size ID
  - number_of_units: How many of that serving (e.g., 2.5 for "2.5 cups")
  - meal: One of "breakfast", "lunch", "dinner", "other"
  - date: Date as YYYY-MM-DD string (default: today)

Returns: Created food entry with nutrition totals.`,
    inputSchema: {
      food_id: z.number().int().describe("FatSecret food ID"),
      food_entry_name: z.string().min(1).describe("Display name for the entry"),
      serving_id: z.number().int().describe("Serving size ID from food details"),
      number_of_units: z.number().positive().describe("Number of servings"),
      meal: z.enum(VALID_MEALS).describe("Meal type"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date YYYY-MM-DD (default: today)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ food_id, food_entry_name, serving_id, number_of_units, meal, date }) => {
    try {
      // Input sanitization
      const safeName = sanitizeString(food_entry_name, "food_entry_name");
      if (!safeName) {
        return { content: [{ type: "text", text: "Error: food_entry_name cannot be empty after sanitization." }] };
      }

      // Date validation
      if (date) {
        const dateCheck = validateDate(date);
        if (!dateCheck.valid) {
          return { content: [{ type: "text", text: `Error: ${dateCheck.error}` }] };
        }
      }

      const dateInt = date ? dateStringToFatSecretInt(date) : todayAsFatSecretInt();

      const data = await makeUserRequest<any>("food_entry.create", {
        food_id,
        food_entry_name: safeName,
        serving_id,
        number_of_units,
        meal,
        date: dateInt,
      });

      const entry = data?.food_entries?.food_entry;
      const e = Array.isArray(entry) ? entry[0] : entry;

      if (!e) {
        return { content: [{ type: "text", text: "Entry created successfully (no details returned)." }] };
      }

      const lines = [
        `# Logged: ${e.food_entry_name}`,
        `- **Entry ID**: ${e.food_entry_id}`,
        `- **Description**: ${e.food_entry_description}`,
        `- **Meal**: ${e.meal}`,
        `- **Date**: ${fatSecretIntToDateString(Number(e.date_int))}`,
        "",
        `## Nutrition`,
        `- Calories: ${e.calories} kcal`,
        `- Protein: ${e.protein} g`,
        `- Carbs: ${e.carbohydrate} g`,
        `- Fat: ${e.fat} g`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Edit Food Entry ─────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_edit_food_entry",
  {
    title: "Edit Food Diary Entry",
    description: `Edit an existing food diary entry. Can change serving size, number of units, or meal type.

Args:
  - food_entry_id: The entry ID to edit (from get_food_entries)
  - food_entry_name: Updated display name (optional)
  - serving_id: New serving ID (optional)
  - number_of_units: New number of servings (optional)
  - meal: New meal type (optional)

Returns: Updated entry with new nutrition values.`,
    inputSchema: {
      food_entry_id: z.number().int().describe("Food entry ID to edit"),
      food_entry_name: z.string().optional().describe("Updated display name"),
      serving_id: z.number().int().optional().describe("New serving ID"),
      number_of_units: z.number().positive().optional().describe("New number of servings"),
      meal: z.enum(VALID_MEALS).optional().describe("New meal type"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ food_entry_id, food_entry_name, serving_id, number_of_units, meal }) => {
    try {
      const params: Record<string, string | number | undefined> = { food_entry_id };
      if (food_entry_name) params.food_entry_name = food_entry_name;
      if (serving_id) params.serving_id = serving_id;
      if (number_of_units) params.number_of_units = number_of_units;
      if (meal) params.meal = meal;

      const data = await makeUserRequest<any>("food_entry.edit", params);

      const entry = data?.food_entries?.food_entry;
      const e = Array.isArray(entry) ? entry[0] : entry;

      if (!e) {
        return { content: [{ type: "text", text: "Entry updated successfully." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Updated entry ${e.food_entry_id}: ${e.food_entry_name} — ${e.calories} kcal, ${e.protein}P/${e.carbohydrate}C/${e.fat}F`,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Delete Food Entry ───────────────────────────────────────────────────

server.registerTool(
  "fatsecret_delete_food_entry",
  {
    title: "Delete Food Diary Entry",
    description: `Delete a food diary entry by its ID.

Args:
  - food_entry_id: The entry ID to delete

Returns: Confirmation of deletion.`,
    inputSchema: {
      food_entry_id: z.number().int().describe("Food entry ID to delete"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ food_entry_id }) => {
    try {
      await makeUserRequest<any>("food_entry.delete", { food_entry_id });
      return { content: [{ type: "text", text: `Deleted food entry ${food_entry_id}.` }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Food Entries for Date ───────────────────────────────────────────

server.registerTool(
  "fatsecret_get_food_entries",
  {
    title: "Get Food Diary Entries",
    description: `Get all food diary entries for a specific date. Shows what was logged for each meal with full nutrition breakdown.

Args:
  - date: Date as YYYY-MM-DD (default: today)

Returns: All food entries grouped by meal with calories, protein, carbs, fat per entry and daily totals.`,
    inputSchema: {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date YYYY-MM-DD (default: today)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ date }) => {
    try {
      const dateInt = date ? dateStringToFatSecretInt(date) : todayAsFatSecretInt();

      const data = await makeUserRequest<any>("food_entries.get.v2", { date: dateInt });

      const entries = data?.food_entries?.food_entry;
      if (!entries || (Array.isArray(entries) && entries.length === 0)) {
        const dateStr = date || fatSecretIntToDateString(dateInt);
        return { content: [{ type: "text", text: `No food entries for ${dateStr}.` }] };
      }

      const entryList = Array.isArray(entries) ? entries : [entries];
      const dateStr = date || fatSecretIntToDateString(dateInt);

      // Group by meal
      const byMeal: Record<string, typeof entryList> = {};
      let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;

      for (const e of entryList) {
        const meal = e.meal || "other";
        if (!byMeal[meal]) byMeal[meal] = [];
        byMeal[meal].push(e);
        totalCal += Number(e.calories) || 0;
        totalP += Number(e.protein) || 0;
        totalC += Number(e.carbohydrate) || 0;
        totalF += Number(e.fat) || 0;
      }

      const lines = [
        `# Food Diary — ${dateStr}`,
        `**Daily Total**: ${totalCal.toFixed(0)} kcal | ${totalP.toFixed(1)}P | ${totalC.toFixed(1)}C | ${totalF.toFixed(1)}F`,
        "",
      ];

      for (const meal of ["Breakfast", "Lunch", "Dinner", "Other"]) {
        const mealEntries = byMeal[meal];
        if (!mealEntries) continue;

        const mealCal = mealEntries.reduce((sum, e) => sum + (Number(e.calories) || 0), 0);
        lines.push(`## ${meal} (${mealCal.toFixed(0)} kcal)`);

        for (const e of mealEntries) {
          lines.push(
            `- **${e.food_entry_name}** (ID: ${e.food_entry_id}) — ` +
            `${e.calories} kcal | ${e.protein}P | ${e.carbohydrate}C | ${e.fat}F`
          );
        }
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Monthly Food Entries ────────────────────────────────────────────

server.registerTool(
  "fatsecret_get_food_entries_month",
  {
    title: "Get Monthly Food Diary Summary",
    description: `Get daily calorie/macro totals for an entire month. Useful for tracking adherence and trends.

Args:
  - month: Month (1-12)
  - year: Year (e.g., 2026)

Returns: Daily totals for each logged day in the month.`,
    inputSchema: {
      month: z.number().int().min(1).max(12).describe("Month number (1-12)"),
      year: z.number().int().min(2000).max(2100).describe("Year"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ month, year }) => {
    try {
      // FatSecret uses date_from as any date in the target month
      const dateInMonth = new Date(year, month - 1, 1);
      const dateInt = Math.floor(dateInMonth.getTime() / (1000 * 60 * 60 * 24));

      const data = await makeUserRequest<any>("food_entries.get_month.v2", { date: dateInt });

      const days = data?.food_entries?.food_entry;
      if (!days) {
        return { content: [{ type: "text", text: `No entries for ${year}-${String(month).padStart(2, "0")}.` }] };
      }

      const dayList = Array.isArray(days) ? days : [days];

      const lines = [
        `# Monthly Summary — ${year}-${String(month).padStart(2, "0")}`,
        `Days logged: ${dayList.length}`,
        "",
        "| Date | Calories | Protein | Carbs | Fat |",
        "|------|----------|---------|-------|-----|",
      ];

      let totalCal = 0;
      for (const d of dayList) {
        const dateStr = fatSecretIntToDateString(Number(d.date_int));
        lines.push(`| ${dateStr} | ${d.calories} | ${d.protein}g | ${d.carbohydrate}g | ${d.fat}g |`);
        totalCal += Number(d.calories) || 0;
      }

      const avgCal = dayList.length > 0 ? (totalCal / dayList.length).toFixed(0) : "0";
      lines.push("", `**Average daily calories**: ${avgCal} kcal`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Create Saved Meal ───────────────────────────────────────────────────

server.registerTool(
  "fatsecret_create_saved_meal",
  {
    title: "Create Saved Meal Template",
    description: `Create a reusable meal template (e.g., "Post-Workout Chicken & Rice"). After creating, add foods to it with fatsecret_add_food_to_saved_meal.

Args:
  - saved_meal_name: Name for the template
  - saved_meal_description: Optional description
  - meal_type: Default meal type when copied to diary

Returns: Created saved meal with its ID.`,
    inputSchema: {
      saved_meal_name: z.string().min(1).describe("Name for the meal template"),
      saved_meal_description: z.string().optional().describe("Optional description"),
      meal_type: z.enum(VALID_MEALS).default("other").describe("Default meal type"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ saved_meal_name, saved_meal_description, meal_type }) => {
    try {
      const params: Record<string, string | number | undefined> = {
        saved_meal_name,
        saved_meal_description,
        meal_type,
      };

      const data = await makeUserRequest<any>("saved_meal.create", params);

      const meal = data?.saved_meal;
      if (meal) {
        return {
          content: [{
            type: "text",
            text: `Created saved meal "${saved_meal_name}" (ID: ${meal.saved_meal_id}). Now add foods with fatsecret_add_food_to_saved_meal.`,
          }],
        };
      }

      return { content: [{ type: "text", text: `Created saved meal "${saved_meal_name}".` }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Add Food to Saved Meal ──────────────────────────────────────────────

server.registerTool(
  "fatsecret_add_food_to_saved_meal",
  {
    title: "Add Food to Saved Meal",
    description: `Add a food item to an existing saved meal template.

Args:
  - saved_meal_id: ID of the saved meal
  - food_id: FatSecret food ID to add
  - food_entry_name: Display name
  - serving_id: Serving size ID
  - number_of_units: Number of servings

Returns: Confirmation with nutrition details.`,
    inputSchema: {
      saved_meal_id: z.number().int().describe("Saved meal ID"),
      food_id: z.number().int().describe("Food ID to add"),
      food_entry_name: z.string().min(1).describe("Display name"),
      serving_id: z.number().int().describe("Serving size ID"),
      number_of_units: z.number().positive().describe("Number of servings"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ saved_meal_id, food_id, food_entry_name, serving_id, number_of_units }) => {
    try {
      await makeUserRequest<any>("saved_meal_item.add", {
        saved_meal_id,
        food_id,
        food_entry_name,
        serving_id,
        number_of_units,
      });

      return {
        content: [{
          type: "text",
          text: `Added "${food_entry_name}" (${number_of_units} servings) to saved meal ${saved_meal_id}.`,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Saved Meals ─────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_get_saved_meals",
  {
    title: "List Saved Meal Templates",
    description: `Get all saved meal templates for the user. Shows meal names, IDs, and food items within each.

Returns: List of saved meals with their IDs, names, and food contents.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      const data = await makeUserRequest<any>("saved_meals.get.v2");

      const meals = data?.saved_meals?.saved_meal;
      if (!meals || (Array.isArray(meals) && meals.length === 0)) {
        return { content: [{ type: "text", text: "No saved meals found." }] };
      }

      const mealList = Array.isArray(meals) ? meals : [meals];

      const lines = [`# Saved Meals (${mealList.length})`, ""];
      for (const m of mealList) {
        lines.push(`## ${m.saved_meal_name} (ID: ${m.saved_meal_id})`);
        if (m.saved_meal_description) lines.push(`*${m.saved_meal_description}*`);
        if (m.meals) lines.push(`Default meal: ${m.meal_type || "other"}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Copy Saved Meal to Diary ────────────────────────────────────────────

server.registerTool(
  "fatsecret_copy_saved_meal_to_diary",
  {
    title: "Copy Saved Meal to Diary",
    description: `Copy all foods from a saved meal template into the food diary for a specific date and meal.

Args:
  - saved_meal_id: ID of the saved meal to copy
  - meal: Target meal type
  - date: Target date YYYY-MM-DD (default: today)

Returns: Confirmation that entries were created.`,
    inputSchema: {
      saved_meal_id: z.number().int().describe("Saved meal ID to copy"),
      meal: z.enum(VALID_MEALS).describe("Target meal slot"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Target date YYYY-MM-DD (default: today)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ saved_meal_id, meal, date }) => {
    try {
      const dateInt = date ? dateStringToFatSecretInt(date) : todayAsFatSecretInt();

      await makeUserRequest<any>("food_entries.copy_saved_meal", {
        saved_meal_id,
        meal,
        date: dateInt,
      });

      const dateStr = date || fatSecretIntToDateString(dateInt);
      return {
        content: [{
          type: "text",
          text: `Copied saved meal ${saved_meal_id} to ${meal} on ${dateStr}.`,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Update Weight ───────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_update_weight",
  {
    title: "Log Weight",
    description: `Log a weight measurement for a specific date.

Args:
  - weight_kg: Weight in kilograms
  - date: Date YYYY-MM-DD (default: today)
  - comment: Optional note

Returns: Confirmation of logged weight.`,
    inputSchema: {
      weight_kg: z.number().positive().describe("Weight in kilograms"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date YYYY-MM-DD (default: today)"),
      comment: z.string().optional().describe("Optional note"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ weight_kg, date, comment }) => {
    try {
      const dateInt = date ? dateStringToFatSecretInt(date) : todayAsFatSecretInt();

      await makeUserRequest<any>("weight.update", {
        current_weight_kg: weight_kg,
        date: dateInt,
        comment,
      });

      const dateStr = date || fatSecretIntToDateString(dateInt);
      return {
        content: [{
          type: "text",
          text: `Logged weight: ${weight_kg} kg on ${dateStr}.`,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Weight Month ────────────────────────────────────────────────────

server.registerTool(
  "fatsecret_get_weights_month",
  {
    title: "Get Monthly Weight History",
    description: `Get weight entries for an entire month. Useful for tracking weight trends during bulk/cut phases.

Args:
  - month: Month (1-12)
  - year: Year (e.g., 2026)

Returns: All weight entries for the month with dates.`,
    inputSchema: {
      month: z.number().int().min(1).max(12).describe("Month (1-12)"),
      year: z.number().int().min(2000).max(2100).describe("Year"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ month, year }) => {
    try {
      const dateInMonth = new Date(year, month - 1, 1);
      const dateInt = Math.floor(dateInMonth.getTime() / (1000 * 60 * 60 * 24));

      const data = await makeUserRequest<any>("weights.get_month.v2", { date: dateInt });

      const entries = data?.month?.day;
      if (!entries) {
        return { content: [{ type: "text", text: `No weight entries for ${year}-${String(month).padStart(2, "0")}.` }] };
      }

      const entryList = Array.isArray(entries) ? entries : [entries];

      const lines = [
        `# Weight Log — ${year}-${String(month).padStart(2, "0")}`,
        "",
        "| Date | Weight (kg) |",
        "|------|-------------|",
      ];

      for (const e of entryList) {
        const dateStr = fatSecretIntToDateString(Number(e.date_int));
        lines.push(`| ${dateStr} | ${e.weight_kg} |`);
      }

      if (entryList.length >= 2) {
        const first = Number(entryList[0].weight_kg);
        const last = Number(entryList[entryList.length - 1].weight_kg);
        const diff = (last - first).toFixed(1);
        lines.push("", `**Change**: ${diff} kg (${Number(diff) >= 0 ? "+" : ""}${diff})`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Get Recently Eaten ──────────────────────────────────────────────────

server.registerTool(
  "fatsecret_get_recently_eaten",
  {
    title: "Get Recently Eaten Foods",
    description: `Get the user's recently eaten foods for quick re-logging. Returns food IDs and serving info ready to use with fatsecret_create_food_entry.

Returns: List of recently logged foods with IDs and serving details.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      const data = await makeUserRequest<any>("foods.get_recently_eaten.v2");

      const foods = data?.foods?.food;
      if (!foods || (Array.isArray(foods) && foods.length === 0)) {
        return { content: [{ type: "text", text: "No recently eaten foods found." }] };
      }

      const foodList = Array.isArray(foods) ? foods : [foods];

      const lines = [`# Recently Eaten (${foodList.length} items)`, ""];
      for (const f of foodList) {
        lines.push(`- **${f.food_name}** (food_id: ${f.food_id}, serving_id: ${f.serving_id})`);
        if (f.food_description) lines.push(`  ${f.food_description}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Tool: Copy Entries Between Dates ──────────────────────────────────────────

server.registerTool(
  "fatsecret_copy_day",
  {
    title: "Copy Food Entries Between Dates",
    description: `Copy all food entries from one date to another. Useful for repeating a day's meals.

Args:
  - from_date: Source date YYYY-MM-DD
  - to_date: Target date YYYY-MM-DD

Returns: Confirmation.`,
    inputSchema: {
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Source date"),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Target date"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ from_date, to_date }) => {
    try {
      const fromInt = dateStringToFatSecretInt(from_date);
      const toInt = dateStringToFatSecretInt(to_date);

      await makeUserRequest<any>("food_entries.copy", {
        from_date: fromInt,
        to_date: toInt,
      });

      return {
        content: [{
          type: "text",
          text: `Copied all food entries from ${from_date} to ${to_date}.`,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validate credentials at startup (fail-fast)
  const creds = validateCredentials();
  if (creds.errors.length > 0) {
    console.error("⚠️  Credential warnings:");
    for (const err of creds.errors) {
      console.error(`   - ${err}`);
    }
  }
  if (!creds.hasAppCredentials) {
    console.error("❌ Cannot start: missing app credentials (FATSECRET_CLIENT_ID + FATSECRET_CONSUMER_SECRET / FATSECRET_OAUTH2_CLIENT_SECRET)");
    process.exit(1);
  }
  if (!creds.hasUserCredentials) {
    console.error("⚠️  User credentials missing — food search will work, but diary/weight tools will fail.");
    console.error("   Complete the OAuth flow to get FATSECRET_ACCESS_TOKEN and FATSECRET_ACCESS_TOKEN_SECRET.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FatSecret MCP Server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
