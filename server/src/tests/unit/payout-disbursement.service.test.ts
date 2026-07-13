import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { disburseReadyPayouts } from "../../shared/lib/payout-disbursement.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

type BookingRow = {
  id: string;
  payment: {
    id: string;
    amount: Prisma.Decimal;
    refundedAmount: Prisma.Decimal | null;
    currency: string;
    metadata: Prisma.JsonValue | null;
  } | null;
  property: { ownerId: string };
};

function buildBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    payment: {
      id: "payment-1",
      amount: new Prisma.Decimal("300.00"),
      refundedAmount: null,
      currency: "USD",
      metadata: null,
    },
    property: { ownerId: "host-1" },
    ...overrides,
  };
}

describe("disburseReadyPayouts", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  it("queries completed stays and cancelled-with-remainder bookings", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);

    await disburseReadyPayouts();

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          payoutStatus: "READY",
          OR: [
            { status: "COMPLETED", payment: { is: { status: "SUCCESS" } } },
            {
              status: "CANCELLED",
              payment: { is: { status: { in: ["SUCCESS", "REFUNDED"] } } },
            },
          ],
        },
      }),
    );
  });

  it("pays the full amount when nothing was refunded", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([buildBooking()] as any);
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });

    const stats = await disburseReadyPayouts();

    expect(stats.paidOut).toBe(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment-1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            payout: expect.objectContaining({ amount: 300 }),
          }),
        }),
      }),
    );
  });

  it("pays only the remainder (amount - refundedAmount) after a partial refund", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      buildBooking({
        payment: {
          id: "payment-1",
          amount: new Prisma.Decimal("300.00"),
          refundedAmount: new Prisma.Decimal("150.00"),
          currency: "USD",
          metadata: null,
        },
      }),
    ] as any);
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });

    const stats = await disburseReadyPayouts();

    expect(stats.paidOut).toBe(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            payout: expect.objectContaining({ amount: 150 }),
          }),
        }),
      }),
    );
  });

  it("skips (never overpays) when the full amount was refunded", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      buildBooking({
        payment: {
          id: "payment-1",
          amount: new Prisma.Decimal("300.00"),
          refundedAmount: new Prisma.Decimal("300.00"),
          currency: "USD",
          metadata: null,
        },
      }),
    ] as any);

    const stats = await disburseReadyPayouts();

    expect(stats.skipped).toBe(1);
    expect(stats.attempted).toBe(0);
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });

  it("skips without committing when the booking state changed before payout", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([buildBooking()] as any);
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 0 });

    const stats = await disburseReadyPayouts();

    expect(stats.paidOut).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});
