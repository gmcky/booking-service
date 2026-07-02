import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("BookingService.getHostBookings", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();

    (mockPrisma.booking.findMany as any).mockResolvedValue([]);
    (mockPrisma.booking.count as any).mockResolvedValue(0);
  });

  it("filters by property ownerId only when no extra filters are passed", async () => {
    await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, {});

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { property: { ownerId: "host-1" } },
      }),
    );
    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: { property: { ownerId: "host-1" } },
    });
  });

  it("includes status filter in where clause when provided", async () => {
    await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, { status: "CONFIRMED" });

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { property: { ownerId: "host-1" }, status: "CONFIRMED" },
      }),
    );
    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: { property: { ownerId: "host-1" }, status: "CONFIRMED" },
    });
  });

  it("includes propertyId filter in where clause when provided", async () => {
    await BookingService.getHostBookings(
      "host-1",
      { page: 1, limit: 10 },
      { propertyId: "property-1" },
    );

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { property: { ownerId: "host-1" }, propertyId: "property-1" },
      }),
    );
    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: { property: { ownerId: "host-1" }, propertyId: "property-1" },
    });
  });

  it("omits status/propertyId keys entirely when filters are absent", async () => {
    await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, {});

    const where = (mockPrisma.booking.findMany as any).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("propertyId");
  });

  it("computes pagination skip/take from page and limit", async () => {
    await BookingService.getHostBookings("host-1", { page: 3, limit: 5 }, {});

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it("includes property select and guest user select without email", async () => {
    await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, {});

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              images: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    );

    const userSelect = (mockPrisma.booking.findMany as any).mock.calls[0][0].include.user.select;
    expect(userSelect).not.toHaveProperty("email");
  });

  it("orders by createdAt desc", async () => {
    await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, {});

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("calls count with the same where clause used for findMany", async () => {
    await BookingService.getHostBookings(
      "host-1",
      { page: 2, limit: 20 },
      { status: "PENDING", propertyId: "property-9" },
    );

    const findManyWhere = (mockPrisma.booking.findMany as any).mock.calls[0][0].where;
    const countWhere = (mockPrisma.booking.count as any).mock.calls[0][0].where;
    expect(countWhere).toEqual(findManyWhere);
  });

  it("returns a paginated response shape", async () => {
    const bookings = [{ id: "booking-1" }];
    (mockPrisma.booking.findMany as any).mockResolvedValue(bookings);
    (mockPrisma.booking.count as any).mockResolvedValue(1);

    const result = await BookingService.getHostBookings("host-1", { page: 1, limit: 10 }, {});

    expect(result).toEqual({
      data: bookings,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });
});
