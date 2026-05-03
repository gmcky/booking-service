import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("BookingService.updateStatus", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("throws 400 when host marks booking COMPLETED before check-out", async () => {
    const booking = {
      id: "booking-1",
      userId: "guest-1",
      status: "CONFIRMED",
      checkOut: new Date(Date.now() + 24 * 60 * 60 * 1000),
      property: { ownerId: "host-1" },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(
      BookingService.updateStatus("booking-1", "host-1", "USER", "COMPLETED"),
    ).rejects.toThrow("Cannot mark booking as completed before check-out time");

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("allows host to mark booking COMPLETED after check-out", async () => {
    const booking = {
      id: "booking-2",
      userId: "guest-2",
      status: "CONFIRMED",
      checkOut: new Date(Date.now() - 60 * 60 * 1000),
      property: { ownerId: "host-2" },
    } as any;

    const updatedBooking = {
      ...booking,
      status: "COMPLETED",
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockResolvedValue(updatedBooking);

    const result = await BookingService.updateStatus(
      "booking-2",
      "host-2",
      "USER",
      "COMPLETED",
    );

    expect(result.status).toBe("COMPLETED");
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-2" },
      data: { status: "COMPLETED" },
    });
  });
});
