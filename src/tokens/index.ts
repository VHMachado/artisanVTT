import { DefaultToken } from "../types/Token";

/**
 * Artisan ships no sample token silhouettes. Tokens are user-provided, while
 * monster rows without curated art render with their outline only.
 */
export const tokenSources: Record<string, string> = {};

export function getDefaultTokens(_userId: string): DefaultToken[] {
  return [];
}
