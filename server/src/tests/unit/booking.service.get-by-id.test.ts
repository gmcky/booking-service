import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

function buildBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "booking-1",
    userId: "guest-1",
    status: "CONFIRMED",
    property: {
      id: "property-1",
      ownerId: "host-1",
      title: "Test Property",
      owner: {
        id: "host-1",
        firstName: "Alex",
        lastName: "Kovalenko",
        avatarUrl: null,
        phoneNumber: "+380501234567",
        email: "owner@demo.com",
      },
    },
    payment: null,
    ...overrides,
  };
}

describe("BookingService.getById", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("attaches hostContact for guest when booking is CONFIRMED", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue(buildBooking());

    const result = await BookingService.getById("booking-1", "guest-1", "USER");

    expect(result.hostContact).toEqual({
      phoneNumber: "+380501234567",
      email: "owner@demo.com",
    });
    expect(result.property.owner).toEqual({
      id: "host-1",
      firstName: "Alex",
      lastName: "Kovalenko",
      avatarUrl: null,
    });
    expect((result.property.owner as any).phoneNumber).toBeUndefined();
    expect((result.property.owner as any).email).toBeUndefined();
  });

  it("returns hostContact null for guest when booking is PENDING", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue(buildBooking({ status: "PENDING" }));

    const result = await BookingService.getById("booking-1", "guest-1", "USER");

    expect(result.hostContact).toBeNull();
  });

  it("returns hostContact null for the host viewer even when CONFIRMED", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue(buildBooking());

    const result = await BookingService.getById("booking-1", "host-1", "USER");

    expect(result.hostContact).toBeNull();
  });

  it("returns hostContact null for guest when booking is CANCELLED", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue(buildBooking({ status: "CANCELLED" }));

    const result = await BookingService.getById("booking-1", "guest-1", "USER");

    expect(result.hostContact).toBeNull();
  });

  it("attaches hostContact for admin when booking is COMPLETED", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue(buildBooking({ status: "COMPLETED" }));

    const result = await BookingService.getById("booking-1", "admin-1", "ADMIN");

    expect(result.hostContact).toEqual({
      phoneNumber: "+380501234567",
      email: "owner@demo.com",
    });
  });
});
