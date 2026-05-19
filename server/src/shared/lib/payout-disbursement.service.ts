import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { getMetadataObject } from "../utils/prisma.helpers.js";

const DEFAULT_PAYOUT_BATCH_SIZE = 50;
const PAYOUT_PROVIDER = "MOCK_HOST_PAYOUT";

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
    where: {
      status: "COMPLETED",
      payoutStatus: "READY",
      payment: {
        is: {
          status: "SUCCESS",
        },
      },
    },
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

    stats.attempted += 1;

    try {
      const providerResult = await sendPayoutToHost({
        bookingId: booking.id,
        hostId: booking.property.ownerId,
        paymentId: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
      });

      const payoutApplied = await prisma.$transaction(async (tx) => {
        const bookingUpdate = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: "COMPLETED",
            payoutStatus: "READY",
            payment: {
              is: {
                status: "SUCCESS",
              },
            },
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
