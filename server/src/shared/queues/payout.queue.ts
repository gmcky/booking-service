import { Queue } from "bullmq";
import { logger } from "../lib/logger.js";
import { redisConnection } from "../lib/redis.js";

export type PayoutJobName = "run-payout-lifecycle";

export interface PayoutLifecycleJobData {
  trigger: "startup" | "repeat" | "manual";
}

export const PAYOUT_LIFECYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_PAYOUT_JOB_ID = "payout-lifecycle-startup";
const REPEATABLE_PAYOUT_JOB_ID = "payout-lifecycle-repeatable";

export const payoutQueue = new Queue<
  PayoutLifecycleJobData,
  void,
  PayoutJobName
>("payout", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

async function scheduleStartupPayoutJob() {
  const existingStartupJob = await payoutQueue.getJob(STARTUP_PAYOUT_JOB_ID);

  if (!existingStartupJob) {
    await payoutQueue.add(
      "run-payout-lifecycle",
      { trigger: "startup" },
      { jobId: STARTUP_PAYOUT_JOB_ID },
    );
    return;
  }

  const state = await existingStartupJob.getState();
  if (state === "completed" || state === "failed") {
    await existingStartupJob.remove();
    await payoutQueue.add(
      "run-payout-lifecycle",
      { trigger: "startup" },
      { jobId: STARTUP_PAYOUT_JOB_ID },
    );
    return;
  }

  logger.debug(
    { jobId: STARTUP_PAYOUT_JOB_ID, state },
    "Skipping startup payout job scheduling because job already exists",
  );
}

export async function schedulePayoutLifecycleJobs() {
  await scheduleStartupPayoutJob();

  await payoutQueue.add(
    "run-payout-lifecycle",
    { trigger: "repeat" },
    {
      jobId: REPEATABLE_PAYOUT_JOB_ID,
      repeat: { every: PAYOUT_LIFECYCLE_INTERVAL_MS },
    },
  );
}

export async function enqueueManualPayoutLifecycleJob() {
  const job = await payoutQueue.add("run-payout-lifecycle", {
    trigger: "manual",
  });

  logger.info(
    {
      jobId: job.id,
      trigger: "manual",
      queue: "payout",
    },
    "Manual payout lifecycle job enqueued",
  );

  return {
    jobId: String(job.id),
    queue: "payout",
    trigger: "manual" as const,
  };
}
