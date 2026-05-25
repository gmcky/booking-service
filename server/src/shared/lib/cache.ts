import { createHash } from "crypto";
import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "./logger.js";

/** Isolated Redis client for application caching. */
export const cacheClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: env.REDIS_USERNAME || undefined,
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

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await cacheClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length > 0) await cacheClient.del(...keys);
}

export async function cacheInvalidateNamespace(namespace: string): Promise<void> {
  await cacheClient.incr(`cache:ver:${namespace}`);
}

export async function cacheGetNamespaceVersion(namespace: string): Promise<string> {
  const ver = await cacheClient.get(`cache:ver:${namespace}`);
  return ver ?? "0";
}

export function hashKey(data: unknown): string {
  return createHash("sha256").update(stableStringify(data)).digest("hex").slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const sorted = Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${sorted.join(",")}}`;
  }
  return JSON.stringify(value);
}
