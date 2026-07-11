import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type GeocodeJobName = "geocode-property";

export interface GeocodePropertyJobData {
  propertyId: string;
}

export const geocodeQueue = new Queue<GeocodePropertyJobData, void, GeocodeJobName>("geocode", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
