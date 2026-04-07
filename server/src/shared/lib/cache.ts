import { createHash } from "crypto";
import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "./logger.js";

/** Dedicated Redis client for app cache; isolated from BullMQ traffic. */
export const cacheClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});

cacheClient.on("error", (err) => {
  logger.error({ err }, "Redis cache client error");
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await cacheClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await cacheClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length > 0) await cacheClient.del(...keys);
}

/** Pattern invalidation via SCAN to avoid blocking Redis with KEYS. */
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

/** Stable short hash for bounded-length cache keys. */
export function hashKey(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 16);
}
