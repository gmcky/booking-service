import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: {},
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../../shared/lib/ops-alert.js", () => ({
  sendOpsAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { cacheInvalidateNamespace } from "../../shared/lib/cache.js";
import { BookingService } from "../../modules/bookings/booking.service.js";
import {
  UNPAID_EXPIRY_HOURS,
  UNPAID_EXPIRY_GRACE_MINUTES,
  UNPAID_CHECKIN_GRACE_HOURS,
} from "../../modules/bookings/booking.constants.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockCacheInvalidate = cacheInvalidateNamespace as ReturnType<typeof vi.fn>;

function makeCandidate(id: string) {
  return {
    id,
    userId: `guest-${id}`,
    checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    checkOut: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
    property: { title: "Test Property", ownerId: "host-1" },
  } as any;
}

describe("BookingService.expireUnpaidBookings", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
    // Email enqueue path resolves users; nulls short-circuit it harmlessly.
    (mockPrisma.user.findFirst as any).mockResolvedValue(null);
  });

  it("targets only stale unpaid PENDING bookings outside the grace window", async () => {
    (mockPrisma.booking.findMany as any).mockResolvedValue([]);

    const before = Date.now();
    await BookingService.expireUnpaidBookings();
    const after = Date.now();

    const where = (mockPrisma.booking.findMany as any).mock.calls[0][0].where;
    expect(where.status).toBe("PENDING");

    const [unpaid, deadline] = where.AND;

    expect(unpaid.OR[0]).toEqual({ payment: { is: null } });
    expect(unpaid.OR[1].payment.status).toEqual({ in: ["PENDING", "FAILED"] });
    const grace = (unpaid.OR[1].payment.updatedAt.lte as Date).getTime();
    expect(grace).toBeGreaterThanOrEqual(before - UNPAID_EXPIRY_GRACE_MINUTES * 60 * 1000);
    expect(grace).toBeLessThanOrEqual(after - UNPAID_EXPIRY_GRACE_MINUTES * 60 * 1000);

    // Deadline: TTL exhausted, OR stay window over, OR check-in passed with
    // the same-day grace spent.
    const ttl = (deadline.OR[0].createdAt.lte as Date).getTime();
    expect(ttl).toBeGreaterThanOrEqual(before - UNPAID_EXPIRY_HOURS * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(after - UNPAID_EXPIRY_HOURS * 60 * 60 * 1000);

    const checkOutStop = (deadline.OR[1].checkOut.lte as Date).getTime();
    expect(checkOutStop).toBeGreaterThanOrEqual(before);
    expect(checkOutStop).toBeLessThanOrEqual(after);

    const checkInPassed = (deadline.OR[2].checkIn.lte as Date).getTime();
    expect(checkInPassed).toBeGreaterThanOrEqual(before);
    expect(checkInPassed).toBeLessThanOrEqual(after);
    const checkInGrace = (deadline.OR[2].createdAt.lte as Date).getTime();
    expect(checkInGrace).toBeGreaterThanOrEqual(
      before - UNPAID_CHECKIN_GRACE_HOURS * 60 * 60 * 1000,
    );
    expect(checkInGrace).toBeLessThanOrEqual(after - UNPAID_CHECKIN_GRACE_HOURS * 60 * 60 * 1000);
  });

  it("expires candidates, voids open host-cancel requests, and invalidates search cache", async () => {
    (mockPrisma.booking.findMany as any).mockResolvedValue([
      makeCandidate("booking-1"),
      makeCandidate("booking-2"),
    ]);
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.hostCancellationRequest.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await BookingService.expireUnpaidBookings();

    expect(result).toEqual({ scanned: 2, expired: 2 });
    expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking-1", status: "PENDING" },
      data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
    });
    expect(mockPrisma.hostCancellationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: "booking-1", status: "PENDING" },
      }),
    );
    expect(mockCacheInvalidate).toHaveBeenCalledWith("properties:search");
  });

  it("skips a booking that stopped being PENDING between scan and write", async () => {
    (mockPrisma.booking.findMany as any).mockResolvedValue([makeCandidate("booking-paid")]);
    // Guest paid (or cancelled) in the window between findMany and updateMany.
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await BookingService.expireUnpaidBookings();

    expect(result).toEqual({ scanned: 1, expired: 0 });
    expect(mockPrisma.hostCancellationRequest.updateMany).not.toHaveBeenCalled();
    expect(mockCacheInvalidate).not.toHaveBeenCalled();
  });

  it("no-ops cleanly when nothing qualifies", async () => {
    (mockPrisma.booking.findMany as any).mockResolvedValue([]);

    const result = await BookingService.expireUnpaidBookings();

    expect(result).toEqual({ scanned: 0, expired: 0 });
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    expect(mockCacheInvalidate).not.toHaveBeenCalled();
  });
});
