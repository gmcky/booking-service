import { createHash } from "crypto";
import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "./logger.js";

/** Dedicated Redis client for application-level caching (separate from BullMQ). */
export const cacheClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});

cacheClient.on("error", (err) => {
  logger.error({ err }, "Redis cache client error");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deserialize and return cached value, or null on miss / parse error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await cacheClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Serialize and store a value with a TTL (seconds). */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await cacheClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

/** Delete one or more exact keys. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length > 0) await cacheClient.del(...keys);
}

/**
 * Delete all keys matching a glob pattern using SCAN (non-blocking).
 * e.g. invalidatePattern("properties:search:*")
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await cacheClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0) await cacheClient.del(...keys);
  } while (cursor !== "0");
}

/**
 * Generate a short, stable cache key suffix from an arbitrary object.
 * Uses SHA-256 so keys stay fixed-length regardless of filter complexity.
 */
export function hashKey(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 16);
}
