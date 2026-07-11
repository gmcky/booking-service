/**
 * Geocode worker. Run via `pnpm worker:geocode`.
 * Resolves property addresses to coordinates through Nominatim. Kept as a
 * queue (not request-path) so listing creation never waits on an external
 * service, and the 1 req/s Nominatim usage policy is enforced globally by
 * the worker limiter no matter how many listings arrive at once.
 */
import "../instrument.js";
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import { prisma } from "../shared/lib/prisma.js";
import { geocodeAddress } from "../shared/lib/geocoder.js";
import { cacheDel, cacheInvalidateNamespace } from "../shared/lib/cache.js";
import type { GeocodeJobName, GeocodePropertyJobData } from "../shared/queues/geocode.queue.js";

async function geocodeProperty(propertyId: string): Promise<void> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      street: true,
      houseNumber: true,
      city: true,
      country: true,
      latitude: true,
    },
  });

  if (!property) {
    logger.warn({ propertyId }, "Geocode target no longer exists — skipping");
    return;
  }

  // A host may have set coordinates explicitly between enqueue and run —
  // their pin wins over anything the geocoder would come up with.
  if (property.latitude !== null) {
    logger.info({ propertyId }, "Property already has coordinates — skipping");
    return;
  }

  const result = await geocodeAddress(property);

  if (!result) {
    logger.warn(
      { propertyId, city: property.city, country: property.country },
      "Address did not geocode — property stays off the map",
    );
    return;
  }

  await prisma.property.update({
    where: { id: propertyId },
    data: { latitude: result.latitude, longitude: result.longitude },
  });

  await Promise.all([
    cacheDel(`property:${propertyId}`),
    cacheInvalidateNamespace("properties:search"),
  ]);

  logger.info(
    {
      propertyId,
      precision: result.precision,
      latitude: result.latitude,
      longitude: result.longitude,
    },
    "Property geocoded",
  );
}

async function processGeocode(job: Job<GeocodePropertyJobData, void, GeocodeJobName>) {
  logger.info({ jobId: job.id, propertyId: job.data.propertyId }, "Processing geocode job");
  await geocodeProperty(job.data.propertyId);
}

const worker = new Worker<GeocodePropertyJobData, void, GeocodeJobName>("geocode", processGeocode, {
  connection: redisConnection,
  concurrency: 1,
  // Nominatim usage policy: absolute maximum of 1 request per second.
  // geocodeAddress may issue up to 3 fallback queries per job, so pace
  // jobs at 1 per 4s to stay under the cap even on worst-case fallbacks.
  limiter: { max: 1, duration: 4000 },
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, propertyId: job.data.propertyId }, "Geocode job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, propertyId: job?.data.propertyId, error }, "Geocode job failed");
});

logger.info("Geocode worker started");
