import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

// Overrides global setup.ts mocks with deep mocks needed for this test file.
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

import { prisma } from "../../shared/lib/prisma.js";
import { stripe } from "../../shared/lib/stripe.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { PaymentRefundService } from "../../modules/payments/payment.refund.service.js";

// TODO: add unit coverage for PaymentRefundService.approveRefund/rejectRefund.

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockStripe = stripe as unknown as {
  refunds: { create: ReturnType<typeof vi.fn> };
};
const mockEmailQueue = emailQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};

type PaymentFixture = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  provider: "STRIPE";
  bookingId: string;
  amount: Prisma.Decimal;
  currency: string;
  status:
    | "SUCCESS"
    | "PENDING"
    | "REFUND_REQUESTED"
    | "REFUND_PROCESSING"
    | "REFUNDED";
  transactionId: string | null;
  metadata: Prisma.JsonValue | null;
  booking: {
    userId: string;
    checkIn: Date;
    checkOut: Date;
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
    payoutStatus: "PENDING" | "PAID_OUT" | "CANCELLED";
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
    property: {
      title: string;
      owner: {
        email: string;
        firstName: string;
      };
    };
  };
};

type BuildPaymentOverrides = Omit<Partial<PaymentFixture>, "booking"> & {
  booking?: Partial<PaymentFixture["booking"]> & {
    user?: Partial<PaymentFixture["booking"]["user"]>;
    property?: Partial<PaymentFixture["booking"]["property"]> & {
      owner?: Partial<PaymentFixture["booking"]["property"]["owner"]>;
    };
  };
};

function buildPayment(overrides: BuildPaymentOverrides = {}): PaymentFixture {
  const now = Date.now();

  const base: PaymentFixture = {
    id: "payment-1",
    createdAt: new Date(now - 60 * 1000),
    updatedAt: new Date(now),
    provider: "STRIPE",
    bookingId: "booking-1",
    amount: new Prisma.Decimal("300.00"),
    currency: "USD",
    status: "SUCCESS",
    transactionId: "pi_test_123",
    metadata: null,
    booking: {
      userId: "user-1",
      checkIn: new Date(now + 10 * 24 * 60 * 60 * 1000),
      checkOut: new Date(now + 15 * 24 * 60 * 60 * 1000),
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      user: { firstName: "Ivan", lastName: "Test", email: "ivan@test.com" },
      property: {
        title: "Test Property",
        owner: { email: "owner@test.com", firstName: "Owner" },
      },
    },
  };

  const o = overrides;

  return {
    ...base,
    ...o,
    booking: {
      ...base.booking,
      ...(o.booking ?? {}),
      user: {
        ...base.booking.user,
        ...(o.booking?.user ?? {}),
      },
      property: {
        ...base.booking.property,
        ...(o.booking?.property ?? {}),
        owner: {
          ...base.booking.property.owner,
          ...(o.booking?.property?.owner ?? {}),
        },
      },
    },
  };
}

function mockPaymentFindUniqueResult(payment: PaymentFixture | null) {
  (mockPrisma.payment.findUnique as any).mockResolvedValue(payment);
}

function mockPaymentUpdateResult(payment: PaymentFixture) {
  (mockPrisma.payment.update as any).mockResolvedValue(payment);
}

function mockPaymentUpdateResults(...payments: PaymentFixture[]) {
  const update = mockPrisma.payment.update as any;
  payments.forEach((payment) => update.mockResolvedValueOnce(payment));
}

describe("PaymentRefundService.requestRefund", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("returns payment as-is when status is already REFUND_REQUESTED", async () => {
    const payment = buildPayment({ status: "REFUND_REQUESTED" });
    mockPaymentFindUniqueResult(payment);

    const result = await PaymentRefundService.requestRefund(
      "payment-1",
      "user-1",
    );

    expect(result).toBe(payment);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("returns payment as-is when status is already REFUND_PROCESSING", async () => {
    const payment = buildPayment({ status: "REFUND_PROCESSING" });
    mockPaymentFindUniqueResult(payment);

    const result = await PaymentRefundService.requestRefund(
      "payment-1",
      "user-1",
    );

    expect(result).toBe(payment);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("throws 403 when userId does not match booking owner", async () => {
    const payment = buildPayment();
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "someone-else"),
    ).rejects.toMatchObject({ statusCode: 403, message: "Not authorized" });
  });

  it("throws 400 when payment status is not SUCCESS", async () => {
    const payment = buildPayment({ status: "PENDING" });
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Refund request can only be created for successful payments",
    });
  });

  it("throws 400 when payout already disbursed to host", async () => {
    const payment = buildPayment({
      booking: { payoutStatus: "PAID_OUT" },
    });
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot request refund after payout has been disbursed to host",
    });
  });

  it("throws 400 when booking is COMPLETED", async () => {
    const payment = buildPayment({
      booking: {
        status: "COMPLETED",
        payoutStatus: "PENDING",
        checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot request refund for completed booking",
    });
  });

  it("throws 400 when check-in is in the past", async () => {
    const payment = buildPayment({
      booking: {
        checkIn: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot request refund after check-in date",
    });
  });

  it("throws 400 when less than 24h before check-in (0% refund window)", async () => {
    const payment = buildPayment({
      booking: {
        checkIn: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    mockPaymentFindUniqueResult(payment);

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Refund request is not allowed less than 24 hours before check-in",
    });
  });

  it("calls stripe.refunds.create for auto-approve when check-in > 7 days away", async () => {
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    const processingPayment = buildPayment({ status: "REFUND_PROCESSING" });
    const refundedPayment = buildPayment({ status: "REFUNDED" });

    mockPaymentFindUniqueResult(payment);
    mockPaymentUpdateResults(processingPayment, refundedPayment);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );
    mockStripe.refunds.create.mockResolvedValue({ id: "re_test_123" } as any);

    await PaymentRefundService.requestRefund(
      "payment-1",
      "user-1",
      "changed plans",
    );

    expect(mockStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_test_123",
        metadata: expect.objectContaining({
          paymentId: "payment-1",
          bookingId: "booking-1",
          autoApproved: "true",
        }),
      }),
      expect.objectContaining({
        idempotencyKey: "refund_auto_payment-1",
      }),
    );
  });

  it("sets payment status to REFUND_PROCESSING before calling Stripe", async () => {
    const callOrder: string[] = [];
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    const processingPayment = buildPayment({ status: "REFUND_PROCESSING" });
    const refundedPayment = buildPayment({ status: "REFUNDED" });

    mockPaymentFindUniqueResult(payment);
    (mockPrisma.payment.update as any)
      .mockImplementationOnce(async () => {
        callOrder.push("db_update");
        return processingPayment;
      })
      .mockImplementationOnce(async () => refundedPayment);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );
    mockStripe.refunds.create.mockImplementation(async () => {
      callOrder.push("stripe_call");
      return { id: "re_test_order" } as any;
    });

    await PaymentRefundService.requestRefund("payment-1", "user-1");

    expect(callOrder).toEqual(["db_update", "stripe_call"]);
    expect(mockPrisma.payment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUND_PROCESSING" }),
      }),
    );
  });

  it("leaves payment in REFUND_PROCESSING state when Stripe call fails", async () => {
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    const processingPayment = buildPayment({ status: "REFUND_PROCESSING" });

    mockPaymentFindUniqueResult(payment);
    (mockPrisma.payment.update as any).mockResolvedValueOnce(processingPayment);
    mockStripe.refunds.create.mockRejectedValue(new Error("Stripe timeout"));

    await expect(
      PaymentRefundService.requestRefund("payment-1", "user-1"),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(mockPrisma.payment.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUND_PROCESSING" }),
      }),
    );
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it("enqueues emails to both guest and host after auto-approve", async () => {
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    const processingPayment = buildPayment({ status: "REFUND_PROCESSING" });
    const refundedPayment = buildPayment({ status: "REFUNDED" });

    mockPaymentFindUniqueResult(payment);
    mockPaymentUpdateResults(processingPayment, refundedPayment);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );
    mockStripe.refunds.create.mockResolvedValue({ id: "re_test_email" } as any);

    await PaymentRefundService.requestRefund("payment-1", "user-1", "reason");

    expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      "refund-processed-guest",
      expect.objectContaining({
        paymentId: "payment-1",
        bookingId: "booking-1",
        guestEmail: "ivan@test.com",
        isApproved: true,
      }),
    );
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      "refund-processed-host",
      expect.objectContaining({
        paymentId: "payment-1",
        bookingId: "booking-1",
        hostEmail: "owner@test.com",
      }),
    );
  });

  it("sets status to REFUND_REQUESTED without calling Stripe when <= 7 days", async () => {
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
    });
    const updatedPayment = buildPayment({
      status: "REFUND_REQUESTED",
      booking: { checkIn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
    });

    mockPaymentFindUniqueResult(payment);
    mockPaymentUpdateResult(updatedPayment);
    mockPrisma.user.findMany.mockResolvedValue([] as any);

    const result = await PaymentRefundService.requestRefund(
      "payment-1",
      "user-1",
      "manual",
    );

    expect(result.status).toBe("REFUND_REQUESTED");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUND_REQUESTED" }),
      }),
    );
  });

  it("notifies all admins when refund requires manual review", async () => {
    const payment = buildPayment({
      booking: { checkIn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
    });
    const updatedPayment = buildPayment({
      status: "REFUND_REQUESTED",
      booking: { checkIn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
    });

    mockPaymentFindUniqueResult(payment);
    mockPaymentUpdateResult(updatedPayment);
    mockPrisma.user.findMany.mockResolvedValue([
      { email: "admin1@test.com", firstName: "Admin1" },
      { email: "admin2@test.com", firstName: "Admin2" },
    ] as any);

    await PaymentRefundService.requestRefund(
      "payment-1",
      "user-1",
      "manual reason",
    );

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    const adminEmails = mockEmailQueue.add.mock.calls.map(
      ([, payload]) => (payload as { adminEmail: string }).adminEmail,
    );
    expect(adminEmails).toEqual(
      expect.arrayContaining(["admin1@test.com", "admin2@test.com"]),
    );
    expect(
      mockEmailQueue.add.mock.calls.every(
        ([jobName]) => jobName === "refund-requested-admin",
      ),
    ).toBe(true);
  });

  it("throws AppError when payment not found", async () => {
    mockPaymentFindUniqueResult(null);

    await expect(
      PaymentRefundService.requestRefund("missing", "user-1"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
