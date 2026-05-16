/**
 * FatSecret API constants
 */

export const API_BASE_URL = "https://platform.fatsecret.com/rest";
export const OAUTH2_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
export const CHARACTER_LIMIT = 25000;

/**
 * Convert a JS Date to FatSecret's "days since epoch" format.
 * FatSecret uses number of days since January 1, 1970.
 */
export function dateToFatSecretInt(date: Date): number {
  const epoch = new Date("1970-01-01T00:00:00Z");
  const diffMs = date.getTime() - epoch.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Convert a YYYY-MM-DD string to FatSecret's days-since-epoch int.
 */
export function dateStringToFatSecretInt(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00Z");
  return dateToFatSecretInt(date);
}

/**
 * Convert FatSecret's days-since-epoch int to a YYYY-MM-DD string.
 */
export function fatSecretIntToDateString(dateInt: number): string {
  const date = new Date(dateInt * 24 * 60 * 60 * 1000);
  return date.toISOString().split("T")[0];
}

/**
 * Get today's date as FatSecret int.
 */
export function todayAsFatSecretInt(): number {
  return dateToFatSecretInt(new Date());
}

export const VALID_MEALS = ["breakfast", "lunch", "dinner", "other"] as const;
export type MealType = typeof VALID_MEALS[number];
