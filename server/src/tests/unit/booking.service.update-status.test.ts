import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
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

    await BookingService.updateStatus("booking-2", "host-2", "USER", "COMPLETED");

    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-2" },
      data: { status: "COMPLETED" },
    });
  });

  it("throws 403 when guest tries to update status", async () => {
    const booking = {
      id: "booking-3",
      userId: "guest-3",
      status: "CONFIRMED",
      checkOut: new Date(Date.now() - 60 * 60 * 1000),
      property: { ownerId: "host-3" },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(
      BookingService.updateStatus("booking-3", "guest-3", "USER", "COMPLETED"),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("throws 403 when unrelated user tries to update status", async () => {
    const booking = {
      id: "booking-4",
      userId: "guest-4",
      status: "CONFIRMED",
      checkOut: new Date(Date.now() - 60 * 60 * 1000),
      property: { ownerId: "host-4" },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(
      BookingService.updateStatus("booking-4", "stranger", "USER", "COMPLETED"),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("throws 400 when attempting CANCELLED via updateStatus", async () => {
    const booking = {
      id: "booking-5",
      userId: "guest-5",
      status: "CONFIRMED",
      checkOut: new Date(Date.now() - 60 * 60 * 1000),
      property: { ownerId: "host-5" },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(
      BookingService.updateStatus("booking-5", "host-5", "USER", "CANCELLED"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Use DELETE /bookings/:id to cancel a booking",
    });
  });

  it("throws 400 on invalid FSM transition (COMPLETED → CONFIRMED)", async () => {
    const booking = {
      id: "booking-6",
      userId: "guest-6",
      status: "COMPLETED",
      checkOut: new Date(Date.now() - 60 * 60 * 1000),
      property: { ownerId: "host-6" },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(
      BookingService.updateStatus("booking-6", "host-6", "USER", "CONFIRMED"),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("throws 404 when booking not found", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      BookingService.updateStatus("missing", "host-x", "USER", "COMPLETED"),
    ).rejects.toMatchObject({ statusCode: 404, message: "Booking not found" });
  });
});
