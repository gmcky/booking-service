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
import { prisma } from "../shared/lib/prisma.js";
import { env } from "../config/env.js";
import {
  cleanupQueue,
  type CleanupJobData,
  type CleanupJobName,
  type UnlinkPropertyImagesJobData,
} from "../shared/queues/cleanup.queue.js";
import {
  PROTECTED_USER_IDS,
  DEMO_USER_ID,
  DEMO_CLEANUP_REPEATABLE_JOB_ID,
} from "../shared/constants/demo-cleanup.js";

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
// purge-demo-data
// ---------------------------------------------------------------------------

interface PurgeStats {
  hostReplies: number;
  reviews: number;
  reviewReports: number;
  bookings: number;
  properties: number;
  userDeleted: 0 | 1;
}

async function purgeUserData(userId: string, deleteRow: boolean): Promise<PurgeStats> {
  return prisma.$transaction(async (tx) => {
    // Order matters: nullable/no-cascade FKs to User cleared first, then the
    // big cascades (bookings → payment+review, properties → all) fire.
    const hostReplies = await tx.review.updateMany({
      where: { hostReplyById: userId },
      data: { hostReplyById: null },
    });
    const reviewReports = await tx.reviewReport.deleteMany({ where: { reporterId: userId } });
    const reviews = await tx.review.deleteMany({ where: { userId } });
    const bookings = await tx.booking.deleteMany({ where: { userId } });
    const properties = await tx.property.deleteMany({ where: { ownerId: userId } });

    let userDeleted: 0 | 1 = 0;
    if (deleteRow) {
      await tx.user.delete({ where: { id: userId } });
      userDeleted = 1;
    }

    return {
      hostReplies: hostReplies.count,
      reviews: reviews.count,
      reviewReports: reviewReports.count,
      bookings: bookings.count,
      properties: properties.count,
      userDeleted,
    };
  });
}

async function purgeDemoData(): Promise<void> {
  // Defense in depth: even if a stale repeatable job fires, env flag short-circuits.
  if (!env.DEMO_CLEANUP_ENABLED) {
    logger.warn("purge-demo-data fired but DEMO_CLEANUP_ENABLED=false — skipping");
    return;
  }

  const targets = await prisma.user.findMany({
    where: { id: { notIn: [...PROTECTED_USER_IDS] } },
    select: { id: true, email: true },
  });

  const totals = {
    hostReplies: 0,
    reviews: 0,
    reviewReports: 0,
    bookings: 0,
    properties: 0,
    usersDeleted: 0,
  };

  for (const user of targets) {
    const isDemo = user.id === DEMO_USER_ID;
    try {
      const stats = await purgeUserData(user.id, !isDemo);
      totals.hostReplies += stats.hostReplies;
      totals.reviews += stats.reviews;
      totals.reviewReports += stats.reviewReports;
      totals.bookings += stats.bookings;
      totals.properties += stats.properties;
      totals.usersDeleted += stats.userDeleted;
      logger.info({ userId: user.id, email: user.email, isDemo, stats }, "Purged user data");
    } catch (err) {
      // Per-user tx isolated — one bad row shouldn't abort the whole pass.
      logger.error(
        { userId: user.id, email: user.email, err },
        "Failed to purge user — continuing with remaining users",
      );
    }
  }

  logger.info({ scanned: targets.length, totals }, "Demo cleanup pass complete");
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

logger.info("Cleanup worker started");
