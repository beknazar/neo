import { createHash } from "crypto";
import { query } from "./db";

const CACHE_TTL_HOURS = 24;

export function cacheKey(queryText: string): string {
  return createHash("sha256").update(queryText).digest("hex").slice(0, 32);
}

export async function getCachedResponse(key: string): Promise<string | null> {
  try {
    const result = await query(
      `SELECT response FROM query_cache
       WHERE cache_key = $1
       AND created_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [key]
    );
    return result.rows[0]?.response ?? null;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  key: string,
  queryText: string,
  response: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO query_cache (cache_key, query, response)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET
         response = EXCLUDED.response,
         created_at = NOW()`,
      [key, queryText, response]
    );
  } catch (err) {
    console.error("Cache write failed:", err);
  }
}

export async function cleanExpiredCache(): Promise<void> {
  try {
    await query(
      `DELETE FROM query_cache WHERE created_at < NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`
    );
  } catch {
    // Non-critical
  }
}
