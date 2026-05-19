/**
 * Cleanup Worker
 *
 * Runs as a separate process: `pnpm worker:cleanup`
 * Picks up jobs from the "cleanup" BullMQ queue and removes files from the
 * local filesystem (e.g. uploaded images that are no longer referenced).
 *
 * Error strategy:
 *   ENOENT  → file already gone; log a warning and treat as success.
 *   anything else (EACCES, EBUSY, …) → rethrow so BullMQ retries with backoff.
 */
import { Worker, type Job } from "bullmq";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import type { CleanupJobData, CleanupJobName } from "../shared/queues/cleanup.queue.js";

// ---------------------------------------------------------------------------
// Security: Path Traversal guard
// ---------------------------------------------------------------------------

/** Absolute path to the only directory the worker is allowed to delete from. */
const UPLOADS_ROOT = resolve(process.cwd(), "uploads");

/**
 * Resolves `relativePath` against CWD and verifies the result sits strictly
 * inside UPLOADS_ROOT.  Throws if the resolved path escapes the boundary
 * (e.g. `../../etc/passwd`, absolute paths, null-byte injections).
 */
function safeResolve(relativePath: string): string {
  // Null-byte injection guard — Node's fs rejects them, but we reject early.
  if (relativePath.includes("\0")) {
    throw new Error(`Null byte in path: ${relativePath}`);
  }

  const absolute = resolve(process.cwd(), relativePath);

  // Ensure the resolved path starts with UPLOADS_ROOT + separator so that a
  // directory named "uploadsfoo" doesn't pass the check.
  if (!absolute.startsWith(UPLOADS_ROOT + sep) && absolute !== UPLOADS_ROOT) {
    throw new Error(
      `Path traversal attempt blocked: "${relativePath}" resolves to "${absolute}" which is outside "${UPLOADS_ROOT}"`,
    );
  }

  return absolute;
}

// ---------------------------------------------------------------------------
// Handlers per job name
// ---------------------------------------------------------------------------

async function unlinkPropertyImages(paths: string[]): Promise<void> {
  const results = await Promise.allSettled(
    paths.map((relativePath) => {
      const absolutePath = safeResolve(relativePath);
      return unlink(absolutePath);
    }),
  );

  const failures: unknown[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;

    const err = result.reason as NodeJS.ErrnoException;

    // Path traversal or null-byte: poisoned job data — do not retry.
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
    throw failures[0]; // Trigger BullMQ backoff + retry for the whole job.
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function processCleanup(job: Job<CleanupJobData, void, CleanupJobName>): Promise<void> {
  logger.info({ jobId: job.id, name: job.name }, "Processing cleanup job");

  switch (job.name) {
    case "unlink-property-images":
      await unlinkPropertyImages(job.data.paths);
      break;
    default: {
      // Exhaustiveness guard — TypeScript will warn if CleanupJobName is extended
      // without a matching case.
      const _exhaustive: never = job.name;
      logger.warn({ name: _exhaustive }, "Unknown cleanup job name — skipping");
    }
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker<CleanupJobData, void, CleanupJobName>("cleanup", processCleanup, {
  connection: redisConnection,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name, paths: job.data.paths }, "Cleanup job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, error }, "Cleanup job failed");
});

logger.info("Cleanup worker started");
