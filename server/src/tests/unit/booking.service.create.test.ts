import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
import { setTimeout as sleep } from "timers/promises";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: { refunds: { create: vi.fn() } },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
  cacheClient: {
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../../modules/users/user.stats.cache.js", () => ({
  invalidateUserStatsCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockSleep = sleep as unknown as ReturnType<typeof vi.fn>;

const FUTURE_CHECK_IN = new Date(Date.now() + 48 * 60 * 60 * 1000);
const FUTURE_CHECK_OUT = new Date(FUTURE_CHECK_IN.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 nights

const baseProperty = {
  id: "property-1",
  ownerId: "host-1",
  title: "Test Property",
  isActive: true,
  maxGuests: 4,
  pricePerNight: new Prisma.Decimal("100.00"),
} as any;

const baseCreatedBooking = {
  id: "booking-1",
  propertyId: "property-1",
  userId: "guest-1",
  checkIn: FUTURE_CHECK_IN,
  checkOut: FUTURE_CHECK_OUT,
  guests: 2,
  totalPrice: new Prisma.Decimal("300.00"),
  status: "PENDING",
  property: { id: "property-1", title: "Test Property", city: "NYC", ownerId: "host-1" },
} as any;

function p2034Error() {
  return new Prisma.PrismaClientKnownRequestError("Transaction serialization failure", {
    code: "P2034",
    clientVersion: "5.0.0",
    meta: {},
  });
}

function setupAvailableProperty() {
  mockPrisma.property.findUnique.mockResolvedValue(baseProperty);
  // checkAvailability inside tx
  (mockPrisma.booking.count as any).mockResolvedValue(0);
  (mockPrisma.blockedDate.count as any).mockResolvedValue(0);
  mockPrisma.booking.create.mockResolvedValue(baseCreatedBooking);
  // fire-and-forget email lookups
  (mockPrisma.user.findFirst as any)
    .mockResolvedValueOnce({ email: "g@test.com", firstName: "Guest", lastName: "User" })
    .mockResolvedValueOnce({ email: "h@test.com", firstName: "Host" });
}

describe("BookingService.create", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("passes totalPrice as Prisma.Decimal to booking.create", async () => {
    setupAvailableProperty();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    await BookingService.create({
      propertyId: "property-1",
      userId: "guest-1",
      checkIn: FUTURE_CHECK_IN,
      checkOut: FUTURE_CHECK_OUT,
      guests: 2,
    });

    expect(mockPrisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalPrice: expect.any(Prisma.Decimal),
        }),
      }),
    );

    const passedTotal = mockPrisma.booking.create.mock.calls[0]![0].data
      .totalPrice as Prisma.Decimal;
    // 100.00 * 3 nights = 300.00
    expect(passedTotal.equals(new Prisma.Decimal("300.00"))).toBe(true);
  });

  it("retries on P2034 and succeeds on third attempt", async () => {
    setupAvailableProperty();
    (mockPrisma.$transaction as any)
      .mockRejectedValueOnce(p2034Error())
      .mockRejectedValueOnce(p2034Error())
      .mockImplementation(async (cb: any) => cb(mockPrisma));

    const result = await BookingService.create({
      propertyId: "property-1",
      userId: "guest-1",
      checkIn: FUTURE_CHECK_IN,
      checkOut: FUTURE_CHECK_OUT,
      guests: 2,
    });

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 50);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 100);
  });

  it("rethrows non-P2034 errors without retrying", async () => {
    setupAvailableProperty();
    (mockPrisma.$transaction as any).mockRejectedValue(new Error("unexpected DB error"));

    await expect(
      BookingService.create({
        propertyId: "property-1",
        userId: "guest-1",
        checkIn: FUTURE_CHECK_IN,
        checkOut: FUTURE_CHECK_OUT,
        guests: 2,
      }),
    ).rejects.toThrow("unexpected DB error");

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it("rethrows P2034 after exhausting all 3 attempts", async () => {
    setupAvailableProperty();
    (mockPrisma.$transaction as any).mockRejectedValue(p2034Error());

    await expect(
      BookingService.create({
        propertyId: "property-1",
        userId: "guest-1",
        checkIn: FUTURE_CHECK_IN,
        checkOut: FUTURE_CHECK_OUT,
        guests: 2,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it("blocks booking when the refund-velocity limit is reached", async () => {
    (cacheClient.get as ReturnType<typeof vi.fn>).mockResolvedValue("3");

    await expect(
      BookingService.create({
        propertyId: "property-1",
        userId: "guest-abuser",
        checkIn: FUTURE_CHECK_IN,
        checkOut: FUTURE_CHECK_OUT,
        guests: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails open when Redis is down for the refund-velocity check", async () => {
    (cacheClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("redis down"));
    setupAvailableProperty();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const result = await BookingService.create({
      propertyId: "property-1",
      userId: "guest-1",
      checkIn: FUTURE_CHECK_IN,
      checkOut: FUTURE_CHECK_OUT,
      guests: 2,
    });

    expect(result).toBeDefined();
  });

  it("rejects a duplicate unpaid booking for the same stay", async () => {
    setupAvailableProperty();
    // First count = availability (CONFIRMED overlaps), second = own PENDING dup.
    (mockPrisma.booking.count as any).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    await expect(
      BookingService.create({
        propertyId: "property-1",
        userId: "guest-1",
        checkIn: FUTURE_CHECK_IN,
        checkOut: FUTURE_CHECK_OUT,
        guests: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("already have an unpaid booking"),
    });

    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });
});
