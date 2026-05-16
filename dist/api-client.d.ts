/**
 * FatSecret API client handling both OAuth 2.0 (app-level) and OAuth 1.0a (user-level) auth.
 *
 * - OAuth 2.0: Used for food search, food get (no user context needed)
 * - OAuth 1.0a (3-legged): Used for food diary, saved meals, weight (user context)
 */
/**
 * Make an OAuth 2.0 authenticated request (app-level, no user context).
 * Used for: foods.search, food.get
 */
export declare function makeAppRequest<T>(method: string, params?: Record<string, string | number | undefined>): Promise<T>;
/**
 * Make an OAuth 1.0a authenticated request (user-level).
 * Used for: food diary, saved meals, weight diary, etc.
 */
export declare function makeUserRequest<T>(method: string, params?: Record<string, string | number | undefined>): Promise<T>;
export declare function handleApiError(error: unknown): string;
//# sourceMappingURL=api-client.d.ts.map