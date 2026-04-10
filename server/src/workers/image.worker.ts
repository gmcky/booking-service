/**
 * Image Processing Worker
 *
 * Runs as a separate process: `pnpm worker:image`
 * Picks up jobs from the "image-processing" BullMQ queue and:
 *   1. Validates each raw path against UPLOADS_ROOT (path-traversal guard).
 *   2. Resizes and converts each image to WebP via sharp.
 *   3. Persists the processed file paths to the property record in DB.
 *   4. Enqueues the original raw files for deletion via the cleanup worker.
 *
 * Output layout: uploads/properties/{propertyId}/{index}.webp
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { prisma } from "../shared/lib/prisma.js";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import type { ImageProcessingJob } from "../shared/queues/image.queue.js";
import {
  cleanupQueue,
  type CleanupJobName,
} from "../shared/queues/cleanup.queue.js";

// ---------------------------------------------------------------------------
// Security: Path Traversal guard (mirrors cleanup.worker.ts)
// ---------------------------------------------------------------------------

/** Absolute path to the only directory image inputs may reside in. */
const UPLOADS_ROOT = resolve(process.cwd(), "uploads");

/**
 * Resolves `inputPath` and verifies it sits strictly inside UPLOADS_ROOT.
 * Throws on null-byte injection or path escapes.
 */
function safeResolve(inputPath: string): string {
  if (inputPath.includes("\0")) {
    throw new Error(`Null byte in path: ${inputPath}`);
  }

  const absolute = resolve(process.cwd(), inputPath);

  if (!absolute.startsWith(UPLOADS_ROOT + sep) && absolute !== UPLOADS_ROOT) {
    throw new Error(
      `Path traversal attempt blocked: "${inputPath}" resolves to "${absolute}" which is outside "${UPLOADS_ROOT}"`,
    );
  }

  return absolute;
}

// ---------------------------------------------------------------------------
// Job handler
// ---------------------------------------------------------------------------

async function processImages(job: Job<ImageProcessingJob>): Promise<void> {
  const { propertyId, rawImagePaths } = job.data;

  logger.info(
    { propertyId, count: rawImagePaths.length },
    "Starting image processing job",
  );

  // Ensure the output directory exists before writing any files.
  const outputDir = resolve(UPLOADS_ROOT, "properties", propertyId);
  await mkdir(outputDir, { recursive: true });

  const processedPaths: string[] = [];

  for (const [, rawPath] of rawImagePaths.entries()) {
    const absoluteInput = safeResolve(rawPath);
    const id = randomUUID();
    const relativePath = `uploads/properties/${propertyId}/${id}.webp`;
    const absoluteOutput = resolve(
      UPLOADS_ROOT,
      "properties",
      propertyId,
      `${id}.webp`,
    );

    await sharp(absoluteInput)
      .resize({ width: 1200, height: 800, fit: "cover" })
      .webp({ quality: 80 })
      .toFile(absoluteOutput);

    processedPaths.push(relativePath);

    logger.debug({ propertyId, id, output: relativePath }, "Image converted");
  }

  // TODO: append/merge with existing images to avoid concurrent upload overwrite race.
  // Persist optimised WebP paths to the property record.
  await prisma.property.update({
    where: { id: propertyId },
    data: { images: processedPaths },
  });

  logger.info(
    { propertyId, processedPaths },
    "DB updated with processed image paths",
  );

  // Remove raw source files via the dedicated cleanup worker.
  const jobName: CleanupJobName = "unlink-property-images";
  await cleanupQueue.add(jobName, { paths: rawImagePaths });

  logger.info(
    { propertyId, count: rawImagePaths.length },
    "Image processing complete",
  );
}

const worker = new Worker<ImageProcessingJob>(
  "image-processing",
  processImages,
  { connection: redisConnection },
);

worker.on("completed", (job) => {
  logger.info(
    { jobId: job.id, propertyId: job.data.propertyId },
    "Image job completed",
  );
});

worker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, propertyId: job?.data.propertyId, error },
    "Image job failed",
  );
});

logger.info("Image worker started");
