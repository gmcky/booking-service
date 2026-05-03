import type { RedisOptions } from "ioredis";
import { env } from "../../config/env.js";

/** Shared BullMQ connection options; `maxRetriesPerRequest: null` is BullMQ-required. */
export const redisConnection: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: env.REDIS_USERNAME || undefined,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};
