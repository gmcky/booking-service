import { prisma } from "./prisma.js";
import type { Prisma } from "@prisma/client";
import { logger } from "./logger.js";
import { getMetadataObject } from "../utils/prisma.helpers.js";

const DEFAULT_PAYOUT_BATCH_SIZE = 50;
const PAYOUT_PROVIDER = "MOCK_HOST_PAYOUT";

// A payout is disbursable for a completed stay, or for a cancelled booking
// whose refund left a remainder owed to the host (payment REFUNDED with a
// partial refundedAmount, or still SUCCESS when cancelled inside the
// no-refund window). payoutStatus READY is only ever set by those two flows.
const DISBURSABLE_BOOKING_WHERE = {
  payoutStatus: "READY",
  OR: [
    { status: "COMPLETED", payment: { is: { status: "SUCCESS" } } },
    { status: "CANCELLED", payment: { is: { status: { in: ["SUCCESS", "REFUNDED"] } } } },
  ],
} satisfies Prisma.BookingWhereInput;

type PayoutRunStats = {
  attempted: number;
  paidOut: number;
  skipped: number;
  failed: number;
};

async function sendPayoutToHost(params: {
  bookingId: string;
  hostId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  logger.info(
    {
      bookingId: params.bookingId,
      hostId: params.hostId,
      paymentId: params.paymentId,
      amount: params.amount,
      currency: params.currency,
      provider: PAYOUT_PROVIDER,
    },
    "Dispatching payout to host using mock provider",
  );

  return {
    providerPayoutId: `mock_payout_${params.bookingId}_${Date.now()}`,
  };
}

export async function disburseReadyPayouts(
  batchSize = DEFAULT_PAYOUT_BATCH_SIZE,
): Promise<PayoutRunStats> {
  const stats: PayoutRunStats = {
    attempted: 0,
    paidOut: 0,
    skipped: 0,
    failed: 0,
  };

  const readyBookings = await prisma.booking.findMany({
    where: DISBURSABLE_BOOKING_WHERE,
    include: {
      payment: true,
      property: {
        select: {
          ownerId: true,
        },
      },
    },
    orderBy: {
      checkOut: "asc",
    },
    take: batchSize,
  });

  for (const booking of readyBookings) {
    const payment = booking.payment;
    if (!payment) {
      stats.skipped += 1;
      logger.warn({ bookingId: booking.id }, "Skipping payout because booking has no payment");
      continue;
    }

    // Host receives what the guest paid minus any refunded share.
    const payoutAmount = Number(payment.amount) - Number(payment.refundedAmount ?? 0);
    if (payoutAmount <= 0) {
      stats.skipped += 1;
      logger.warn(
        { bookingId: booking.id, paymentId: payment.id, payoutAmount },
        "Skipping payout because no remainder is owed to the host",
      );
      continue;
    }

    stats.attempted += 1;

    try {
      const providerResult = await sendPayoutToHost({
        bookingId: booking.id,
        hostId: booking.property.ownerId,
        paymentId: payment.id,
        amount: payoutAmount,
        currency: payment.currency,
      });

      const payoutApplied = await prisma.$transaction(async (tx) => {
        const bookingUpdate = await tx.booking.updateMany({
          where: {
            id: booking.id,
            ...DISBURSABLE_BOOKING_WHERE,
          },
          data: {
            payoutStatus: "PAID_OUT",
          },
        });

        if (bookingUpdate.count === 0) {
          return false;
        }

        const existingMetadata = getMetadataObject(payment.metadata);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              ...existingMetadata,
              payout: {
                provider: PAYOUT_PROVIDER,
                providerPayoutId: providerResult.providerPayoutId,
                amount: payoutAmount,
                paidOutAt: new Date().toISOString(),
              },
            },
          },
        });

        return true;
      });

      if (!payoutApplied) {
        stats.skipped += 1;
        logger.info(
          { bookingId: booking.id, paymentId: payment.id },
          "Skipping payout because booking state changed before payout commit",
        );
        continue;
      }

      stats.paidOut += 1;
      logger.info(
        {
          bookingId: booking.id,
          paymentId: payment.id,
          providerPayoutId: providerResult.providerPayoutId,
        },
        "Payout marked as PAID_OUT",
      );
    } catch (error) {
      stats.failed += 1;
      logger.error(
        { error, bookingId: booking.id, paymentId: payment.id },
        "Failed to disburse payout",
      );
    }
  }

  return stats;
}
