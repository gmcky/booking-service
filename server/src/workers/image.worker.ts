/**
 * Image Processing Worker
 *
 * Runs as a separate process: `pnpm worker:image`
 * Picks up jobs from the "image-processing" BullMQ queue and handles two job types:
 *
 * type=property:
 *   1. Validates raw paths against UPLOADS_ROOT (path-traversal guard).
 *   2. Resizes and converts each image to WebP via sharp.
 *   3. Persists processed file paths to the property record in DB.
 *   4. Enqueues raw files for deletion via the cleanup worker.
 *   Output layout: uploads/properties/{propertyId}/{index}.webp
 *
 * type=avatar:
 *   1. Reads temp file written by the request handler.
 *   2. Resizes to 512x512 WebP via sharp.
 *   3. Uploads to S3 and updates the user record.
 *   4. Deletes old S3 avatar (best-effort) and temp file.
 */
import "../instrument.js";
import sharp from "sharp";
import { mkdir, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { prisma } from "../shared/lib/prisma.js";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import type {
  ImageProcessingJob,
  PropertyImageJob,
  AvatarImageJob,
} from "../shared/queues/image.queue.js";
import { cleanupQueue, type CleanupJobName } from "../shared/queues/cleanup.queue.js";
import { uploadToS3, deleteFromS3 } from "../shared/lib/storage.js";

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
// Job handlers
// ---------------------------------------------------------------------------

async function processPropertyImages(job: Job<PropertyImageJob>): Promise<void> {
  const { propertyId, rawImagePaths } = job.data;

  logger.info(
    { propertyId, count: rawImagePaths.length },
    "Starting property image processing job",
  );

  // Ensure the output directory exists before writing any files.
  const outputDir = resolve(UPLOADS_ROOT, "properties", propertyId);
  await mkdir(outputDir, { recursive: true });

  const processedPaths: string[] = [];

  for (const [, rawPath] of rawImagePaths.entries()) {
    const absoluteInput = safeResolve(rawPath);
    const id = randomUUID();
    const relativePath = `uploads/properties/${propertyId}/${id}.webp`;
    const absoluteOutput = resolve(UPLOADS_ROOT, "properties", propertyId, `${id}.webp`);

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

  logger.info({ propertyId, processedPaths }, "DB updated with processed image paths");

  // Remove raw source files via the dedicated cleanup worker.
  const jobName: CleanupJobName = "unlink-property-images";
  await cleanupQueue.add(jobName, { paths: rawImagePaths });

  logger.info({ propertyId, count: rawImagePaths.length }, "Property image processing complete");
}

async function processAvatarJob(job: Job<AvatarImageJob>): Promise<void> {
  const { userId, tempFilePath, oldAvatarUrl } = job.data;

  logger.info({ userId }, "Starting avatar processing job");

  const absoluteInput = safeResolve(tempFilePath);

  const optimizedBuffer = await sharp(absoluteInput)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();

  const key = `avatars/${userId}/${randomUUID()}.webp`;
  const avatarUrl = await uploadToS3(optimizedBuffer, key, "image/webp");

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });

  if (oldAvatarUrl) {
    try {
      await deleteFromS3(oldAvatarUrl);
    } catch (error) {
      logger.warn({ userId, oldAvatarUrl, error }, "Failed to delete previous avatar from S3");
    }
  }

  await unlink(absoluteInput).catch((error) => {
    logger.warn({ userId, tempFilePath, error }, "Failed to delete avatar temp file");
  });

  logger.info({ userId, avatarUrl }, "Avatar processed and uploaded");
}

async function processJob(job: Job<ImageProcessingJob>): Promise<void> {
  if (job.data.type === "avatar") {
    await processAvatarJob(job as Job<AvatarImageJob>);
  } else {
    await processPropertyImages(job as Job<PropertyImageJob>);
  }
}

const worker = new Worker<ImageProcessingJob>("image-processing", processJob, {
  connection: redisConnection,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, type: job.data.type }, "Image job completed");
});

worker.on("failed", (job, error) => {
  if (!job) {
    logger.error({ error }, "Image job failed (no job data)");
    return;
  }

  logger.error({ jobId: job.id, type: job.data.type, error }, "Image job failed");

  // Clean up orphaned temp file when all retries are exhausted.
  if (job.data.type === "avatar" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const abs = resolve(process.cwd(), job.data.tempFilePath);
    unlink(abs).catch(() => {});
  }
});

logger.info("Image worker started");
