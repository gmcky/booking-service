import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type CleanupJobName =
  | "unlink-property-images"
  | "purge-demo-data"
  | "auto-approve-host-cancellations"
  | "expire-unpaid-bookings";

export interface UnlinkPropertyImagesJobData {
  paths: string[];
}

// Empty payload — handler reads the protected-email constants and live DB state.
export type PurgeDemoDataJobData = Record<string, never>;

// Empty payload — handler reads platform settings and live DB state.
export type AutoApproveHostCancellationsJobData = Record<string, never>;

// Empty payload — handler reads the expiry constants and live DB state.
export type ExpireUnpaidBookingsJobData = Record<string, never>;

export type CleanupJobData =
  | UnlinkPropertyImagesJobData
  | PurgeDemoDataJobData
  | AutoApproveHostCancellationsJobData
  | ExpireUnpaidBookingsJobData;

export const cleanupQueue = new Queue<CleanupJobData, void, CleanupJobName>("cleanup", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
