import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    refunds: {
      create: vi.fn(),
    },
    paymentIntents: {
      capture: vi.fn(),
      cancel: vi.fn(),
    },
  },
}));

vi.mock("../../shared/lib/ops-alert.js", () => ({
  sendOpsAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "test-webhook-secret",
  },
}));

import { prisma } from "../../shared/lib/prisma.js";
import { stripe } from "../../shared/lib/stripe.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { sendOpsAlert } from "../../shared/lib/ops-alert.js";
import { PaymentWebhookService } from "../../modules/payments/payment.webhook.service.js";

const mockSendOpsAlert = sendOpsAlert as ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockStripe = stripe as unknown as {
  webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  refunds: { create: ReturnType<typeof vi.fn> };
  paymentIntents: { capture: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
};
const mockEmailQueue = emailQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};

function makeStripeEvent(id: string, type: string, dataObject: object) {
  return { id, type, data: { object: dataObject } };
}

describe("PaymentWebhookService.handleStripeWebhook", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("returns success immediately when event was already processed", async () => {
    const event = makeStripeEvent("evt_dup", "payment_intent.succeeded", {});
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue({
      id: "seen",
      eventId: "evt_dup",
      eventType: "payment_intent.succeeded",
      createdAt: new Date(),
    });

    const result = await PaymentWebhookService.handleStripeWebhook("raw", "sig");

    expect(result).toEqual({ success: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it("treats concurrent P2002 on processedStripeEvent.create as success (real DB work done)", async () => {
    // payment_intent.succeeded with bookingId → handler does real DB work,
    // then processedStripeEvent.create throws P2002 (concurrent delivery) → must not rethrow.
    const event = makeStripeEvent("evt_race", "payment_intent.succeeded", {
      id: "pi_race",
      metadata: { bookingId: "booking-race" },
      amount_received: 10000,
      currency: "usd",
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    (mockPrisma.payment.findUnique as any).mockResolvedValue({
      id: "payment-race",
      metadata: null,
    });
    (mockPrisma.payment.update as any).mockResolvedValue({ id: "payment-race" });
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.booking.findUnique as any).mockResolvedValue(null);
    (mockPrisma.processedStripeEvent.create as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.0.0",
      }),
    );

    const result = await PaymentWebhookService.handleStripeWebhook("raw", "sig");

    expect(result).toEqual({ success: true });
    expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CONFIRMED" } }),
    );
  });

  it("enqueues guest and host emails with correct jobIds for payment_intent.succeeded", async () => {
    const eventId = "evt_pay_ok";
    const event = makeStripeEvent(eventId, "payment_intent.succeeded", {
      id: "pi_test_ok",
      metadata: { bookingId: "booking-1" },
      amount_received: 30000,
      currency: "usd",
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    (mockPrisma.payment.findUnique as any).mockResolvedValue({
      id: "payment-1",
      metadata: null,
    });
    (mockPrisma.payment.update as any).mockResolvedValue({ id: "payment-1" });
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.booking.findUnique as any).mockResolvedValue({
      id: "booking-1",
      checkIn: new Date(),
      checkOut: new Date(),
      user: { email: "guest@test.com", firstName: "Guest", lastName: "User" },
      property: {
        title: "Beach House",
        owner: { email: "host@test.com", firstName: "Host" },
      },
    });
    (mockPrisma.processedStripeEvent.create as any).mockResolvedValue({});

    await PaymentWebhookService.handleStripeWebhook("raw", "sig");

    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
    expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1", status: { in: ["PENDING", "CONFIRMED"] } },
        data: { status: "CONFIRMED" },
      }),
    );
    expect(mockEmailQueue.add).toHaveBeenCalledWith("payment-success-guest", expect.any(Object), {
      jobId: `payment-success-guest-${eventId}`,
    });
    expect(mockEmailQueue.add).toHaveBeenCalledWith("payment-success-host", expect.any(Object), {
      jobId: `payment-success-host-${eventId}`,
    });
  });

  describe("amount_capturable_updated (confirm race)", () => {
    const AUTH_BOOKING = {
      id: "booking-race",
      propertyId: "property-1",
      checkIn: new Date("2026-08-10"),
      checkOut: new Date("2026-08-13"),
      user: { email: "guest@test.com", firstName: "Guest" },
      property: { title: "Beach House" },
    };

    function authEvent(eventId = "evt_auth") {
      const event = makeStripeEvent(eventId, "payment_intent.amount_capturable_updated", {
        id: "pi_auth",
        metadata: { bookingId: "booking-race" },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue(null);
      (mockPrisma.processedStripeEvent.create as any).mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    }

    it("captures and confirms when no confirmed booking overlaps", async () => {
      authEvent();
      (mockPrisma.booking.findUnique as any).mockResolvedValue(AUTH_BOOKING);
      (mockPrisma.booking.count as any).mockResolvedValue(0);
      (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
      mockStripe.paymentIntents.capture.mockResolvedValue({ id: "pi_auth" });

      await PaymentWebhookService.handleStripeWebhook("raw", "sig");

      expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith(
        "pi_auth",
        {},
        { idempotencyKey: "capture_pi_auth" },
      );
      expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it("voids the authorization and releases the booking when the race is lost", async () => {
      authEvent("evt_lost");
      (mockPrisma.booking.findUnique as any).mockResolvedValue(AUTH_BOOKING);
      // An overlapping CONFIRMED booking already exists.
      (mockPrisma.booking.count as any).mockResolvedValue(1);
      (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
      (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
      mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_auth" });

      await PaymentWebhookService.handleStripeWebhook("raw", "sig");

      expect(mockStripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
        "pi_auth",
        {},
        { idempotencyKey: "void_pi_auth" },
      );
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: "booking-race", status: "PENDING" },
        data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { bookingId: "booking-race", status: "PENDING" },
        data: { status: "FAILED" },
      });
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        "booking-dates-taken-guest",
        expect.objectContaining({ bookingId: "booking-race", guestEmail: "guest@test.com" }),
        { jobId: "dates-taken-evt_lost" },
      );
    });

    it("voids without emailing when the booking was already released", async () => {
      authEvent("evt_gone");
      (mockPrisma.booking.findUnique as any)
        .mockResolvedValueOnce(AUTH_BOOKING)
        // In-tx status recheck: cancelled by guest/expiry meanwhile.
        .mockResolvedValueOnce({ status: "CANCELLED" });
      (mockPrisma.booking.count as any).mockResolvedValue(0);
      (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 0 });
      (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
      mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_auth" });

      await PaymentWebhookService.handleStripeWebhook("raw", "sig");

      expect(mockStripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it("rolls back the confirm and releases the booking when capture fails", async () => {
      authEvent("evt_capfail");
      (mockPrisma.booking.findUnique as any).mockResolvedValue(AUTH_BOOKING);
      (mockPrisma.booking.count as any).mockResolvedValue(0);
      (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 1 });
      (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
      mockStripe.paymentIntents.capture.mockRejectedValue(new Error("card_declined"));
      mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_auth" });

      await PaymentWebhookService.handleStripeWebhook("raw", "sig");

      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: "booking-race", status: "CONFIRMED" },
        data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
      });
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalled();
      expect(mockSendOpsAlert).toHaveBeenCalled();
    });
  });

  it("refunds a late payment instead of confirming a cancelled booking", async () => {
    const event = makeStripeEvent("evt_late_pay", "payment_intent.succeeded", {
      id: "pi_late",
      metadata: { bookingId: "booking-expired" },
      amount_received: 4800,
      currency: "usd",
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    (mockPrisma.payment.findUnique as any).mockResolvedValue({
      id: "payment-expired",
      metadata: null,
    });
    (mockPrisma.payment.update as any).mockResolvedValue({ id: "payment-expired" });
    // Booking was cancelled (e.g. unpaid-expiry sweep) before the event landed.
    (mockPrisma.booking.updateMany as any).mockResolvedValue({ count: 0 });
    (mockPrisma.payment.updateMany as any).mockResolvedValue({ count: 1 });
    mockStripe.refunds.create.mockResolvedValue({ id: "re_late_1" });
    (mockPrisma.processedStripeEvent.create as any).mockResolvedValue({});

    const result = await PaymentWebhookService.handleStripeWebhook("raw", "sig");

    expect(result).toEqual({ success: true });
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_late" },
      { idempotencyKey: "late_payment_refund_pi_late" },
    );
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-expired", status: "SUCCESS" },
      data: { status: "REFUND_PROCESSING" },
    });
    // No confirmation emails for a booking that was never confirmed.
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
    // Event is still recorded as processed.
    expect(mockPrisma.processedStripeEvent.create).toHaveBeenCalled();
  });

  it("enqueues host email with correct jobId for charge.refunded", async () => {
    const eventId = "evt_charge_refund";
    const event = makeStripeEvent(eventId, "charge.refunded", {
      id: "ch_test_123",
      payment_intent: "pi_test_refund",
      amount_refunded: 30000,
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(event);
    (mockPrisma.processedStripeEvent.findUnique as any).mockResolvedValue(null);
    (mockPrisma.payment.findFirst as any).mockResolvedValue({
      id: "payment-2",
      bookingId: "booking-2",
      status: "SUCCESS",
      amount: new Prisma.Decimal("300.00"),
      currency: "USD",
      metadata: null,
      booking: {
        checkIn: new Date(),
        checkOut: new Date(),
        user: { firstName: "Guest", lastName: "User" },
        property: {
          title: "Mountain Cabin",
          owner: { email: "host@test.com", firstName: "Host" },
        },
      },
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    (mockPrisma.payment.update as any).mockResolvedValue({});
    (mockPrisma.booking.update as any).mockResolvedValue({ id: "booking-2" });
    (mockPrisma.processedStripeEvent.create as any).mockResolvedValue({});

    await PaymentWebhookService.handleStripeWebhook("raw", "sig");

    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUNDED" }),
      }),
    );
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "CANCELLED", payoutStatus: "CANCELLED" },
      }),
    );
    expect(mockEmailQueue.add).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.add).toHaveBeenCalledWith("refund-processed-host", expect.any(Object), {
      jobId: `refund-processed-host-${eventId}`,
    });
  });
});
