import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type CleanupJobName = "unlink-property-images" | "purge-demo-data";

export interface UnlinkPropertyImagesJobData {
  paths: string[];
}

// Empty payload — handler reads PROTECTED_USER_IDS and live DB state.
export type PurgeDemoDataJobData = Record<string, never>;

export type CleanupJobData = UnlinkPropertyImagesJobData | PurgeDemoDataJobData;

export const cleanupQueue = new Queue<CleanupJobData, void, CleanupJobName>("cleanup", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
