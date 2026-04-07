import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export interface ImageProcessingJob {
  propertyId: string;
  /** Raw upload refs; worker resolves and persists final URLs. */
  rawImagePaths: string[];
}

export const imageQueue = new Queue<ImageProcessingJob>("image-processing", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100, // Keep recent successes for postmortem/debug.
    removeOnFail: 200,
  },
});
