import { Worker, type Job } from "bullmq";
import { prisma } from "../shared/lib/prisma.js";
import { logger } from "../shared/lib/logger.js";
import { redisConnection } from "../shared/lib/redis.js";
import { sendOpsAlert } from "../shared/lib/ops-alert.js";
import { disburseReadyPayouts } from "../shared/lib/payout-disbursement.service.js";
import type { PayoutLifecycleJobData, PayoutJobName } from "../shared/queues/payout.queue.js";

const PAYOUT_WORKER_CONCURRENCY = 5;
const PAYOUT_JOB_LOCK_DURATION_MS = 10 * 60 * 1000;

async function completeFinishedBookings(now: Date): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      status: "CONFIRMED",
      checkOut: { lte: now },
      payment: {
        is: {
          status: "SUCCESS",
        },
      },
    },
    data: {
      status: "COMPLETED",
    },
  });

  return result.count;
}

async function maturePayouts(now: Date): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      status: "COMPLETED",
      payoutStatus: "PENDING",
      checkOut: { lte: now },
      payment: {
        is: {
          status: "SUCCESS",
        },
      },
    },
    data: {
      payoutStatus: "READY",
    },
  });

  return result.count;
}

async function runPayoutLifecycle(
  job: Job<PayoutLifecycleJobData, void, PayoutJobName>,
): Promise<void> {
  const now = new Date();
  const completedCount = await completeFinishedBookings(now);
  const maturedCount = await maturePayouts(now);
  const disbursement = await disburseReadyPayouts();
  const totalActions = completedCount + maturedCount + disbursement.attempted;

  if (totalActions === 0) {
    logger.info(`Job done - none (ID: ${job.id})`);
    return;
  }

  logger.info(
    {
      jobId: job.id,
      trigger: job.data.trigger,
      details: {
        completedCount,
        maturedCount,
        payoutAttempted: disbursement.attempted,
        payoutPaidOut: disbursement.paidOut,
        payoutSkipped: disbursement.skipped,
        payoutFailed: disbursement.failed,
        runAt: now.toISOString(),
      },
    },
    `Job done - processed ${totalActions} actions!`,
  );
}

const worker = new Worker<PayoutLifecycleJobData, void, PayoutJobName>(
  "payout",
  runPayoutLifecycle,
  {
    connection: redisConnection,
    concurrency: PAYOUT_WORKER_CONCURRENCY,
    lockDuration: PAYOUT_JOB_LOCK_DURATION_MS,
  },
);

worker.on("completed", (job) => {
  logger.info(
    {
      jobId: job.id,
      trigger: job.data.trigger,
    },
    "Payout lifecycle job completed",
  );
});

worker.on("failed", (job, error) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts.attempts ?? 1;
  const finalFailure = attemptsMade >= maxAttempts;

  logger.error(
    {
      jobId: job?.id,
      trigger: job?.data.trigger,
      attemptsMade,
      maxAttempts,
      finalFailure,
      error,
    },
    "Payout lifecycle job failed",
  );

  if (!job || !finalFailure) {
    return;
  }

  const alertMessage =
    error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);

  void sendOpsAlert({
    title: "Payout lifecycle job permanently failed",
    message: alertMessage,
    context: {
      queue: "payout",
      jobId: job.id,
      trigger: job.data.trigger,
      attemptsMade,
      maxAttempts,
    },
  });
});

logger.info("Payout worker started");

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutting down payout worker gracefully");

  const forceShutdownTimeout = setTimeout(() => {
    logger.error("Forced payout worker shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceShutdownTimeout.unref();

  try {
    await worker.close();
    logger.info("Payout worker closed");
    await prisma.$disconnect();
    logger.info("Database connection closed");
    clearTimeout(forceShutdownTimeout);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Error during payout worker shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
