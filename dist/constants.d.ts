/**
 * FatSecret API constants
 */
export declare const API_BASE_URL = "https://platform.fatsecret.com/rest";
export declare const OAUTH2_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
export declare const CHARACTER_LIMIT = 25000;
/**
 * Convert a JS Date to FatSecret's "days since epoch" format.
 * FatSecret uses number of days since January 1, 1970.
 */
export declare function dateToFatSecretInt(date: Date): number;
/**
 * Convert a YYYY-MM-DD string to FatSecret's days-since-epoch int.
 */
export declare function dateStringToFatSecretInt(dateStr: string): number;
/**
 * Convert FatSecret's days-since-epoch int to a YYYY-MM-DD string.
 */
export declare function fatSecretIntToDateString(dateInt: number): string;
/**
 * Get today's date as FatSecret int.
 */
export declare function todayAsFatSecretInt(): number;
export declare const VALID_MEALS: readonly ["breakfast", "lunch", "dinner", "other"];
export type MealType = typeof VALID_MEALS[number];
//# sourceMappingURL=constants.d.ts.map