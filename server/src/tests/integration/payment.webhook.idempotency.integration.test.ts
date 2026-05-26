import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const testDoubles = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  emailAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: {
    webhooks: { constructEvent: testDoubles.constructEvent },
  },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: testDoubles.emailAdd },
}));

import type { PaymentWebhookService as PaymentWebhookServiceType } from "../../modules/payments/payment.webhook.service.js";

let prisma: PrismaClient;
let PaymentWebhookService: typeof PaymentWebhookServiceType;

function makePaymentIntentEvent(eventId: string, bookingId: string) {
  return {
    id: eventId,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_${eventId}`,
        object: "payment_intent",
        amount: 30000,
        amount_received: 30000,
        currency: "usd",
        status: "succeeded",
        metadata: { bookingId },
      },
    },
  };
}

describe("Stripe webhook idempotency integration", () => {
  beforeAll(async () => {
    const [{ prisma: prismaClient }, { PaymentWebhookService: svc }] = await Promise.all([
      import("../../shared/lib/prisma.js"),
      import("../../modules/payments/payment.webhook.service.js"),
    ]);
    prisma = prismaClient;
    PaymentWebhookService = svc;
  });

  beforeEach(async () => {
    testDoubles.constructEvent.mockReset();
    testDoubles.emailAdd.mockClear();

    await prisma.processedStripeEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.property.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await prisma.processedStripeEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.property.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("replaying same webhook event creates no duplicate Payment row or email job", async () => {
    // Seed: user (owner) + property + guest + booking.
    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@test.dev`,
        passwordHash: "hash",
        firstName: "Owner",
        lastName: "Webhook",
        role: "USER",
      },
    });

    const guest = await prisma.user.create({
      data: {
        email: `guest-${Date.now()}@test.dev`,
        passwordHash: "hash",
        firstName: "Guest",
        lastName: "Webhook",
        role: "USER",
      },
    });

    const property = await prisma.property.create({
      data: {
        ownerId: owner.id,
        title: "Webhook Test Property",
        description: "Test property for webhook idempotency.",
        type: "APARTMENT",
        city: "Kyiv",
        address: "Test St 1",
        pricePerNight: 100,
        maxGuests: 2,
      },
    });

    const checkIn = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    checkIn.setUTCHours(14, 0, 0, 0);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 3);
    checkOut.setUTCHours(12, 0, 0, 0);

    const booking = await prisma.booking.create({
      data: {
        propertyId: property.id,
        userId: guest.id,
        checkIn,
        checkOut,
        guests: 1,
        totalPrice: 300,
        status: "PENDING",
      },
    });

    const eventId = `evt_idem_${Date.now()}`;
    const stripeEvent = makePaymentIntentEvent(eventId, booking.id);
    testDoubles.constructEvent.mockReturnValue(stripeEvent);

    // First delivery — handler runs, payment + processedStripeEvent rows created.
    const first = await PaymentWebhookService.handleStripeWebhook("raw-body", "sig");
    expect(first).toEqual({ success: true });

    const paymentCountAfterFirst = await prisma.payment.count({ where: { bookingId: booking.id } });
    expect(paymentCountAfterFirst).toBe(1);

    const dedupCountAfterFirst = await prisma.processedStripeEvent.count({
      where: { eventId },
    });
    expect(dedupCountAfterFirst).toBe(1);

    const emailCallsAfterFirst = testDoubles.emailAdd.mock.calls.length;
    expect(emailCallsAfterFirst).toBeGreaterThanOrEqual(1);

    // Second delivery (replay) — early-returns at dedup check, no side effects.
    const second = await PaymentWebhookService.handleStripeWebhook("raw-body", "sig");
    expect(second).toEqual({ success: true });

    const paymentCountAfterSecond = await prisma.payment.count({
      where: { bookingId: booking.id },
    });
    expect(paymentCountAfterSecond).toBe(1);

    const dedupCountAfterSecond = await prisma.processedStripeEvent.count({
      where: { eventId },
    });
    expect(dedupCountAfterSecond).toBe(1);

    // No new email jobs enqueued on replay.
    expect(testDoubles.emailAdd.mock.calls.length).toBe(emailCallsAfterFirst);
  });
});
