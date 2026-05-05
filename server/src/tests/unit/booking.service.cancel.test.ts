import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: {
    refunds: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../../shared/lib/ops-alert.js", () => ({
  sendOpsAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { stripe } from "../../shared/lib/stripe.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { sendOpsAlert } from "../../shared/lib/ops-alert.js";
import { BookingService } from "../../modules/bookings/booking.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockStripe = stripe as unknown as {
  refunds: { create: ReturnType<typeof vi.fn> };
};
const mockEmailQueue = emailQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};
const mockSendOpsAlert = sendOpsAlert as ReturnType<typeof vi.fn>;

describe("BookingService.cancel", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("issues Stripe refund for paid booking and marks payment REFUNDED", async () => {
    const now = Date.now();

    const booking = {
      id: "booking-1",
      userId: "guest-1",
      propertyId: "property-1",
      checkIn: new Date(now + 10 * 24 * 60 * 60 * 1000),
      checkOut: new Date(now + 13 * 24 * 60 * 60 * 1000),
      totalPrice: new Prisma.Decimal("300.00"),
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      property: {
        id: "property-1",
        ownerId: "host-1",
        title: "Test Property",
      },
      payment: {
        id: "payment-1",
        bookingId: "booking-1",
        amount: new Prisma.Decimal("300.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_test_123",
        metadata: null,
      },
    } as any;

    const cancelledBooking = {
      ...booking,
      status: "CANCELLED",
      payoutStatus: "CANCELLED",
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    (mockPrisma.payment.updateMany as any)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockStripe.refunds.create.mockResolvedValue({ id: "re_cancel_1" } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.booking.update.mockResolvedValue(cancelledBooking);
    (mockPrisma.user.findUnique as any)
      .mockResolvedValueOnce({
        email: "guest@test.com",
        firstName: "Guest",
        lastName: "User",
      })
      .mockResolvedValueOnce({
        email: "host@test.com",
        firstName: "Host",
      });
    mockEmailQueue.add.mockResolvedValue(undefined as never);

    const result = await BookingService.cancel("booking-1", "guest-1", "USER");

    expect(result.booking.status).toBe("CANCELLED");
    expect(result.cancellation).toBeDefined();
    expect(result.cancellation!.refundPercent).toBe(100);
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_test_123",
      }),
      expect.objectContaining({
        idempotencyKey: "booking_cancel_refund_payment-1",
      }),
    );
    expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUND_PROCESSING" }),
      }),
    );
    expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUNDED" }),
      }),
    );
  });

  it("retries DB finalization and succeeds on second attempt when first throws", async () => {
    const now = Date.now();

    const booking = {
      id: "booking-retry",
      userId: "guest-1",
      propertyId: "property-1",
      checkIn: new Date(now + 10 * 24 * 60 * 60 * 1000),
      checkOut: new Date(now + 13 * 24 * 60 * 60 * 1000),
      totalPrice: new Prisma.Decimal("300.00"),
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      property: { id: "property-1", ownerId: "host-1", title: "Test Property" },
      payment: {
        id: "payment-retry",
        bookingId: "booking-retry",
        amount: new Prisma.Decimal("300.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_retry",
        metadata: null,
      },
    } as any;

    const cancelledBooking = { ...booking, status: "CANCELLED", payoutStatus: "CANCELLED" } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
    mockStripe.refunds.create.mockResolvedValue({ id: "re_retry" } as any);
    (mockPrisma.$transaction as any)
      .mockRejectedValueOnce(new Error("DB transient error"))
      .mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.booking.update.mockResolvedValue(cancelledBooking);
    (mockPrisma.user.findUnique as any)
      .mockResolvedValueOnce({ email: "guest@test.com", firstName: "Guest", lastName: "User" })
      .mockResolvedValueOnce({ email: "host@test.com", firstName: "Host" });
    mockEmailQueue.add.mockResolvedValue(undefined as never);

    const result = await BookingService.cancel("booking-retry", "guest-1", "USER");

    expect(result.booking.status).toBe("CANCELLED");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(mockSendOpsAlert).not.toHaveBeenCalled();
  });

  it("fires ops alert and throws 500 when DB finalization fails all retries", async () => {
    const now = Date.now();

    const booking = {
      id: "booking-exhausted",
      userId: "guest-1",
      propertyId: "property-1",
      checkIn: new Date(now + 10 * 24 * 60 * 60 * 1000),
      checkOut: new Date(now + 13 * 24 * 60 * 60 * 1000),
      totalPrice: new Prisma.Decimal("300.00"),
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      property: { id: "property-1", ownerId: "host-1", title: "Test Property" },
      payment: {
        id: "payment-exhausted",
        bookingId: "booking-exhausted",
        amount: new Prisma.Decimal("300.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_exhausted",
        metadata: null,
      },
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
    mockStripe.refunds.create.mockResolvedValue({ id: "re_exhausted" } as any);
    (mockPrisma.$transaction as any).mockRejectedValue(new Error("DB down"));

    await expect(
      BookingService.cancel("booking-exhausted", "guest-1", "USER"),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mockSendOpsAlert).toHaveBeenCalledOnce();
    expect(mockSendOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          bookingId: "booking-exhausted",
          paymentId: "payment-exhausted",
          stripeRefundId: "re_exhausted",
          idempotencyKey: "booking_cancel_refund_payment-exhausted",
        }),
      }),
    );
  });

  it("does not call Stripe when cancellation window has 0% refund", async () => {
    const now = Date.now();

    const booking = {
      id: "booking-2",
      userId: "guest-2",
      propertyId: "property-2",
      checkIn: new Date(now + 6 * 60 * 60 * 1000),
      checkOut: new Date(now + 30 * 60 * 60 * 1000),
      totalPrice: new Prisma.Decimal("200.00"),
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      property: {
        id: "property-2",
        ownerId: "host-2",
        title: "Another Property",
      },
      payment: {
        id: "payment-2",
        bookingId: "booking-2",
        amount: new Prisma.Decimal("200.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_test_456",
        metadata: null,
      },
    } as any;

    const cancelledBooking = {
      ...booking,
      status: "CANCELLED",
      payoutStatus: "CANCELLED",
    } as any;

    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockResolvedValue(cancelledBooking);
    (mockPrisma.user.findUnique as any)
      .mockResolvedValueOnce({
        email: "guest2@test.com",
        firstName: "Guest2",
        lastName: "User2",
      })
      .mockResolvedValueOnce({
        email: "host2@test.com",
        firstName: "Host2",
      });
    mockEmailQueue.add.mockResolvedValue(undefined as never);

    const result = await BookingService.cancel("booking-2", "guest-2", "USER");

    expect(result.booking.status).toBe("CANCELLED");
    expect(result.cancellation).toBeDefined();
    expect(result.cancellation!.refundPercent).toBe(0);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });
});
