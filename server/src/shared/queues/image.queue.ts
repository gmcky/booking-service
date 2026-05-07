import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export interface PropertyImageJob {
  type: "property";
  propertyId: string;
  /** Raw upload refs; worker resolves and persists final URLs. */
  rawImagePaths: string[];
}

export interface AvatarImageJob {
  type: "avatar";
  userId: string;
  /** Relative path to temp file written by the request handler. */
  tempFilePath: string;
  /** S3 URL of the previous avatar to delete after upload succeeds. */
  oldAvatarUrl: string | null;
}

export type ImageProcessingJob = PropertyImageJob | AvatarImageJob;

export const imageQueue = new Queue<ImageProcessingJob>("image-processing", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100, // Keep recent successes for postmortem/debug.
    removeOnFail: 200,
  },
});
