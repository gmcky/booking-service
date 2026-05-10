import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Overrides global setup.ts mocks with deep mocks needed for this test file.
vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

function d(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe("BookingService.checkAvailability", () => {
  const existingBooking = {
    checkIn: d("2026-06-10"),
    checkOut: d("2026-06-15"),
  };

  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();

    mockPrisma.blockedDate.count.mockResolvedValue(0);

    (mockPrisma.booking.count as any).mockImplementation(
      async ({ where }: any) => {
        const newCheckIn = where.checkOut.gt as Date;
        const newCheckOut = where.checkIn.lt as Date;

        const overlaps =
          existingBooking.checkIn < newCheckOut &&
          existingBooking.checkOut > newCheckIn;

        return overlaps ? 1 : 0;
      },
    );
  });

  it.each([
    {
      name: "returns false for full overlap",
      checkIn: d("2026-06-10"),
      checkOut: d("2026-06-15"),
      expected: false,
    },
    {
      name: "returns false for left overlap",
      checkIn: d("2026-06-08"),
      checkOut: d("2026-06-12"),
      expected: false,
    },
    {
      name: "returns false for right overlap",
      checkIn: d("2026-06-14"),
      checkOut: d("2026-06-17"),
      expected: false,
    },
    {
      name: "returns false when new booking fully covers existing booking",
      checkIn: d("2026-06-08"),
      checkOut: d("2026-06-17"),
      expected: false,
    },
    {
      name: "returns false when new booking is fully inside existing booking",
      checkIn: d("2026-06-11"),
      checkOut: d("2026-06-13"),
      expected: false,
    },
    {
      name: "returns true when new booking is before existing booking",
      checkIn: d("2026-06-05"),
      checkOut: d("2026-06-10"),
      expected: true,
    },
    {
      name: "returns true when new booking is after existing booking",
      checkIn: d("2026-06-15"),
      checkOut: d("2026-06-18"),
      expected: true,
    },
  ])("$name", async ({ checkIn, checkOut, expected }) => {
    const available = await BookingService.checkAvailability(
      "property-1",
      checkIn,
      checkOut,
    );

    expect(available).toBe(expected);
  });

  describe("blocked dates", () => {
    it("returns false when dates overlap with a blocked period", async () => {
      (mockPrisma.booking.count as any).mockResolvedValue(0);
      mockPrisma.blockedDate.count.mockResolvedValue(1);

      const result = await BookingService.checkAvailability(
        "property-1",
        d("2026-06-10"),
        d("2026-06-15"),
      );

      expect(result).toBe(false);
    });

    it("returns true when no bookings and no blocked dates", async () => {
      (mockPrisma.booking.count as any).mockResolvedValue(0);
      mockPrisma.blockedDate.count.mockResolvedValue(0);

      const result = await BookingService.checkAvailability(
        "property-1",
        d("2026-06-10"),
        d("2026-06-15"),
      );

      expect(result).toBe(true);
    });
  });

  it("passes excludeBookingId to query when provided", async () => {
    (mockPrisma.booking.count as any).mockResolvedValue(0);
    mockPrisma.blockedDate.count.mockResolvedValue(0);

    await BookingService.checkAvailability(
      "property-1",
      d("2026-06-10"),
      d("2026-06-15"),
      prisma,
      "booking-to-exclude",
    );

    expect(mockPrisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "booking-to-exclude" },
          status: { in: ["PENDING", "CONFIRMED"] },
        }),
      }),
    );
  });

  it("passes correct overlap query operators (gt/lt) to booking.count", async () => {
    (mockPrisma.booking.count as any).mockResolvedValue(0);
    mockPrisma.blockedDate.count.mockResolvedValue(0);
    const checkIn = d("2026-06-10");
    const checkOut = d("2026-06-15");

    await BookingService.checkAvailability("property-1", checkIn, checkOut);

    expect(mockPrisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          propertyId: "property-1",
          status: { in: ["PENDING", "CONFIRMED"] },
          checkOut: { gt: checkIn },
          checkIn: { lt: checkOut },
        }),
      }),
    );
  });
});
