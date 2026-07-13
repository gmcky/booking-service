import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { env } from "../../config/env.js";
import {
  DEMO_USER_EMAIL,
  PROTECTED_EMAILS,
  PROTECTED_EMAIL_DOMAINS,
} from "../constants/demo-cleanup.js";

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
    // Host reply columns are all-or-nothing (reviews_host_reply_consistency_check),
    // so the reply text and timestamp must be cleared together with the author id.
    const hostReplies = await tx.review.updateMany({
      where: { hostReplyById: userId },
      data: { hostReplyText: null, hostReplyCreatedAt: null, hostReplyById: null },
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

export async function purgeDemoData(): Promise<void> {
  // Defense in depth: even if a stale repeatable job fires, env flag short-circuits.
  if (!env.DEMO_CLEANUP_ENABLED) {
    logger.warn("purge-demo-data fired but DEMO_CLEANUP_ENABLED=false — skipping");
    return;
  }

  const targets = await prisma.user.findMany({
    where: {
      email: { notIn: [...PROTECTED_EMAILS] },
      NOT: PROTECTED_EMAIL_DOMAINS.map((domain) => ({ email: { endsWith: `@${domain}` } })),
    },
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
    const isDemo = user.email === DEMO_USER_EMAIL;
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
