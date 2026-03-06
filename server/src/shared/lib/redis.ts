import type { RedisOptions } from "ioredis";
import { env } from "../../config/env.js";

/**
 * Shared BullMQ connection options.
 * Passing plain RedisOptions (not a Redis instance) lets each Queue/Worker
 * manage its own connection — avoids ioredis version type conflicts.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export const redisConnection: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};
