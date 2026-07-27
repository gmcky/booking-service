import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn() },
}));

vi.mock("../../config/env.js", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test_key" },
}));

import { prisma } from "../../shared/lib/prisma.js";
import { stripe } from "../../shared/lib/stripe.js";
import { PaymentIntentService } from "../../modules/payments/payment.intent.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockStripe = stripe as unknown as {
  paymentIntents: { create: ReturnType<typeof vi.fn> };
};

const BOOKING = {
  id: "booking-1",
  userId: "user-1",
  propertyId: "property-1",
  status: "PENDING",
  checkIn: new Date("2026-09-01"),
  checkOut: new Date("2026-09-03"),
  totalPrice: new Prisma.Decimal("195.00"),
  payment: null,
};

beforeEach(() => {
  mockReset(mockPrisma);
  vi.clearAllMocks();
  (mockPrisma.booking.findUnique as any).mockResolvedValue(BOOKING);
  (mockPrisma.booking.count as any).mockResolvedValue(0);
  (mockPrisma.payment.upsert as any).mockResolvedValue({ id: "payment-1" });
  mockStripe.paymentIntents.create.mockResolvedValue({
    id: "pi_1",
    client_secret: "pi_1_secret",
  });
});

describe("PaymentIntentService.createIntent", () => {
  it("offers only the payment methods this flow has been exercised with", async () => {
    // The confirm race authorizes first and captures later, and every method
    // reaches that path with its own timing. Left to the dashboard defaults,
    // Stripe also offered Klarna, Affirm, Link and Amazon Pay — none of which
    // has ever been walked through. Cash App Pay is in the list because it has
    // been, the hard way: it delivered its authorization webhook twice and
    // three paid stays were refunded before the cause was found.
    await PaymentIntentService.createIntent({ bookingId: "booking-1" }, "user-1");

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capture_method: "manual",
        payment_method_types: ["card", "cashapp"],
      }),
      expect.objectContaining({ idempotencyKey: "intent_booking-1_19500" }),
    );
  });

  it("keys the intent by amount so a repriced booking mints a fresh one", async () => {
    (mockPrisma.booking.findUnique as any).mockResolvedValue({
      ...BOOKING,
      totalPrice: new Prisma.Decimal("240.00"),
    });

    await PaymentIntentService.createIntent({ bookingId: "booking-1" }, "user-1");

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 24000 }),
      expect.objectContaining({ idempotencyKey: "intent_booking-1_24000" }),
    );
  });
});
