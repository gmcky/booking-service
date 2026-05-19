import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type CleanupJobName = "unlink-property-images";

export interface CleanupJobData {
  paths: string[];
}

export const cleanupQueue = new Queue<CleanupJobData, void, CleanupJobName>("cleanup", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
