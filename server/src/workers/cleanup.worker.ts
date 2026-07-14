/**
 * Cleanup worker. Run via `pnpm worker:cleanup`.
 * Handles two queue jobs:
 *   - unlink-property-images: orphan upload files.
 *   - purge-demo-data: gated by DEMO_CLEANUP_ENABLED. Demo user row stays,
 *     data wiped; all other non-origin users get hard-deleted.
 */
import "../instrument.js";
import { Worker, type Job } from "bullmq";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import { env } from "../config/env.js";
import { purgeDemoData } from "../shared/lib/demo-purge.service.js";
import {
  cleanupQueue,
  type CleanupJobData,
  type CleanupJobName,
  type UnlinkPropertyImagesJobData,
} from "../shared/queues/cleanup.queue.js";
import { DEMO_CLEANUP_REPEATABLE_JOB_ID } from "../shared/constants/demo-cleanup.js";
import { HostCancellationService } from "../modules/bookings/host-cancel.service.js";

// Hourly sweep for host cancellation requests left pending past the configured
// window. The service reads the (admin-tunable) policy and no-ops when disabled.
const AUTO_APPROVE_HOST_CANCEL_CRON = "0 * * * *";
const AUTO_APPROVE_HOST_CANCEL_JOB_ID = "auto-approve-host-cancellations-repeatable";

// ---------------------------------------------------------------------------
// Path traversal guard
// ---------------------------------------------------------------------------

const UPLOADS_ROOT = resolve(process.cwd(), "uploads");

function safeResolve(relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new Error(`Null byte in path: ${relativePath}`);
  }

  const absolute = resolve(process.cwd(), relativePath);

  // Trailing-sep check rejects sibling dirs like "uploadsfoo" that share the prefix.
  if (!absolute.startsWith(UPLOADS_ROOT + sep) && absolute !== UPLOADS_ROOT) {
    throw new Error(
      `Path traversal attempt blocked: "${relativePath}" resolves to "${absolute}" which is outside "${UPLOADS_ROOT}"`,
    );
  }

  return absolute;
}

// ---------------------------------------------------------------------------
// unlink-property-images
// ---------------------------------------------------------------------------

async function unlinkPropertyImages(paths: string[]): Promise<void> {
  const results = await Promise.allSettled(
    paths.map((relativePath) => unlink(safeResolve(relativePath))),
  );

  const failures: unknown[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;

    const err = result.reason as NodeJS.ErrnoException;

    // No errno = path-traversal/null-byte reject. Poison pill, don't retry.
    if (!err.code) {
      logger.error({ path: paths[i], error: err }, "Unsafe path rejected — discarding job");
      throw err;
    }

    if (err.code === "ENOENT") {
      logger.warn({ path: paths[i] }, "File not found during cleanup — skipping");
      return;
    }

    logger.error({ path: paths[i], error: err }, "Failed to unlink file");
    failures.push(err);
  });

  if (failures.length > 0) {
    throw failures[0];
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function processCleanup(job: Job<CleanupJobData, void, CleanupJobName>): Promise<void> {
  logger.info({ jobId: job.id, name: job.name }, "Processing cleanup job");

  switch (job.name) {
    case "unlink-property-images": {
      const data = job.data as UnlinkPropertyImagesJobData;
      await unlinkPropertyImages(data.paths);
      break;
    }
    case "purge-demo-data":
      await purgeDemoData();
      break;
    case "auto-approve-host-cancellations": {
      const result = await HostCancellationService.autoApproveStale();
      logger.info(result, "Host cancellation auto-approval sweep complete");
      break;
    }
    default: {
      const _exhaustive: never = job.name;
      logger.warn({ name: _exhaustive }, "Unknown cleanup job name — skipping");
    }
  }
}

// ---------------------------------------------------------------------------
// Repeatable job lifecycle
// ---------------------------------------------------------------------------

// Idempotent on startup: reconciles the repeatable job with DEMO_CLEANUP_ENABLED.
async function syncDemoCleanupSchedule(): Promise<void> {
  const existing = await cleanupQueue.getRepeatableJobs();
  // Match by name, not id: entries registered by older code (or without a
  // custom jobId) are keyed by an opts hash and would survive an id filter —
  // one such orphan kept a */2min test cron firing in prod for weeks.
  const stale = existing.filter((j) => j.name === "purge-demo-data");

  for (const job of stale) {
    await cleanupQueue.removeRepeatableByKey(job.key);
  }

  if (!env.DEMO_CLEANUP_ENABLED) {
    if (stale.length > 0) {
      logger.info({ removed: stale.length }, "DEMO_CLEANUP_ENABLED=false — schedule removed");
    } else {
      logger.info("Demo cleanup disabled");
    }
    return;
  }

  await cleanupQueue.add(
    "purge-demo-data",
    {},
    {
      repeat: { pattern: env.DEMO_CLEANUP_CRON },
      jobId: DEMO_CLEANUP_REPEATABLE_JOB_ID,
    },
  );

  logger.info(
    { cron: env.DEMO_CLEANUP_CRON, jobId: DEMO_CLEANUP_REPEATABLE_JOB_ID },
    "Demo cleanup schedule registered",
  );
}

// Idempotent on startup: ensures exactly one repeatable auto-approve job.
async function syncHostCancelAutoApproveSchedule(): Promise<void> {
  const existing = await cleanupQueue.getRepeatableJobs();
  const stale = existing.filter((j) => j.name === "auto-approve-host-cancellations");
  for (const job of stale) {
    await cleanupQueue.removeRepeatableByKey(job.key);
  }

  await cleanupQueue.add(
    "auto-approve-host-cancellations",
    {},
    {
      repeat: { pattern: AUTO_APPROVE_HOST_CANCEL_CRON },
      jobId: AUTO_APPROVE_HOST_CANCEL_JOB_ID,
    },
  );

  logger.info(
    { cron: AUTO_APPROVE_HOST_CANCEL_CRON },
    "Host cancellation auto-approval schedule registered",
  );
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker<CleanupJobData, void, CleanupJobName>("cleanup", processCleanup, {
  connection: redisConnection,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "Cleanup job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, error }, "Cleanup job failed");
});

await syncDemoCleanupSchedule();
await syncHostCancelAutoApproveSchedule();

logger.info("Cleanup worker started");
