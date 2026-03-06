/**
 * Image Processing Worker
 *
 * Runs as a separate process: `pnpm worker:image`
 * Picks up jobs from the "image-processing" BullMQ queue and:
 *   1. Resizes and compresses each image to WebP  (stub — requires `sharp`)
 *   2. Uploads to S3/Cloudinary                   (stub — requires AWS SDK or cloudinary)
 *   3. Updates the property record in DB with final CDN URLs.
 *
 * TODO [Storage]: pnpm add sharp @types/sharp
 * TODO [Storage]: Configure S3 client (pnpm add @aws-sdk/client-s3) or Cloudinary SDK.
 */
import { Worker, type Job } from "bullmq";
import { prisma } from "../shared/lib/prisma.js";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import type { ImageProcessingJob } from "../shared/queues/image.queue.js";

async function processImages(job: Job<ImageProcessingJob>): Promise<void> {
  const { propertyId, rawImagePaths } = job.data;

  logger.info(
    { propertyId, count: rawImagePaths.length },
    "Starting image processing job",
  );

  // Step 1: Resize + compress each image to WebP.
  // TODO [Storage]: Replace stub with real sharp pipeline.
  // const processedBuffers = await Promise.all(
  //   rawImagePaths.map((tempPath) =>
  //     sharp(tempPath)
  //       .resize({ width: 1200, height: 800, fit: "cover" })
  //       .webp({ quality: 80 })
  //       .toBuffer(),
  //   ),
  // );

  // Step 2: Upload processed buffers to S3/Cloudinary.
  // TODO [Storage]: Replace stub URLs with real upload results.
  // const uploadedUrls = await Promise.all(
  //   processedBuffers.map((buffer, i) =>
  //     s3.send(new PutObjectCommand({
  //       Bucket: env.S3_BUCKET,
  //       Key: `properties/${propertyId}/${i}.webp`,
  //       Body: buffer,
  //       ContentType: "image/webp",
  //     })).then(() => `${env.CDN_BASE_URL}/properties/${propertyId}/${i}.webp`),
  //   ),
  // );
  const uploadedUrls: string[] = rawImagePaths.map(
    (_, i) => `https://cdn.example.com/properties/${propertyId}/${i}.webp`,
  );

  // Step 3: Persist final CDN URLs to DB.
  await prisma.property.update({
    where: { id: propertyId },
    data: { images: uploadedUrls },
  });

  logger.info({ propertyId, uploadedUrls }, "Image processing complete");
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
