import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export interface ImageProcessingJob {
  propertyId: string;
  /** Temporary file paths or presigned upload keys sent by the client. */
  rawImagePaths: string[];
}

export const imageQueue = new Queue<ImageProcessingJob>("image-processing", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100, // Keep last N completed jobs for debugging.
    removeOnFail: 200,
  },
});
