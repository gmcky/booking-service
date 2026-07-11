/**
 * One-off backfill: re-derive every listing's map pin from its address.
 * Clears stored coordinates and enqueues a geocode job per property; the
 * geocode worker (must be running) resolves them at its rate-limited pace.
 *
 * Usage: pnpm db:regeocode
 */
import { prisma } from "../src/shared/lib/prisma.js";
import { geocodeQueue } from "../src/shared/queues/geocode.queue.js";
import { cacheInvalidateNamespace, cacheDel } from "../src/shared/lib/cache.js";
import { logger } from "../src/shared/lib/logger.js";

const properties = await prisma.property.findMany({
  select: { id: true, title: true, city: true },
});

await prisma.property.updateMany({ data: { latitude: null, longitude: null } });

for (const property of properties) {
  await geocodeQueue.add("geocode-property", { propertyId: property.id });
}

await Promise.all([
  cacheInvalidateNamespace("properties:search"),
  ...properties.map((p) => cacheDel(`property:${p.id}`)),
]);

logger.info(
  { count: properties.length },
  "Coordinates cleared, geocode jobs enqueued — keep the geocode worker running",
);

await prisma.$disconnect();
process.exit(0);
