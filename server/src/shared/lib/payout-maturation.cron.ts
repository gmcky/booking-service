import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { disburseReadyPayouts } from "./payout-disbursement.service.js";

const PAYOUT_MATURATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function completeFinishedBookings(now: Date): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      status: "CONFIRMED",
      checkOut: { lte: now },
      payment: {
        is: {
          status: "SUCCESS",
        },
      },
    },
    data: {
      status: "COMPLETED",
    },
  });

  return result.count;
}

async function maturePayouts(now: Date): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      status: "COMPLETED",
      payoutStatus: "PENDING",
      checkOut: { lte: now },
      payment: {
        is: {
          status: "SUCCESS",
        },
      },
    },
    data: {
      payoutStatus: "READY",
    },
  });

  return result.count;
}

async function runPayoutLifecycle(): Promise<void> {
  const now = new Date();
  const completedCount = await completeFinishedBookings(now);
  const maturedCount = await maturePayouts(now);
  const disbursement = await disburseReadyPayouts();

  logger.info(
    {
      completedCount,
      maturedCount,
      payoutAttempted: disbursement.attempted,
      payoutPaidOut: disbursement.paidOut,
      payoutSkipped: disbursement.skipped,
      payoutFailed: disbursement.failed,
      runAt: now.toISOString(),
    },
    "Payout lifecycle cron finished",
  );
}

export function startPayoutMaturationCron() {
  let running = false;

  const runSafely = async () => {
    if (running) {
      logger.warn(
        "Skipping payout maturation run because previous run is still in progress",
      );
      return;
    }

    running = true;
    try {
      await runPayoutLifecycle();
    } catch (error) {
      logger.error({ error }, "Payout lifecycle cron failed");
    } finally {
      running = false;
    }
  };

  logger.info(
    {
      intervalMs: PAYOUT_MATURATION_INTERVAL_MS,
    },
    "Starting payout maturation cron",
  );

  void runSafely();
  const timer = setInterval(() => {
    void runSafely();
  }, PAYOUT_MATURATION_INTERVAL_MS);

  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
      logger.info("Stopped payout maturation cron");
    },
  };
}
