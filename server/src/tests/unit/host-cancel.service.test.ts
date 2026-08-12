import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/stripe.js", () => ({
  stripe: { refunds: { create: vi.fn() } },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn() },
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
import { HostCancellationService } from "../../modules/bookings/host-cancel.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockStripe = stripe as unknown as { refunds: { create: ReturnType<typeof vi.fn> } };
const mockEmailQueue = emailQueue as unknown as { add: ReturnType<typeof vi.fn> };

const HOST_ID = "host-1";
const ADMIN_ID = "admin-1";
const now = Date.now();

function buildBookingForRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    status: "CONFIRMED",
    checkIn: new Date(now + 10 * 86_400_000),
    checkOut: new Date(now + 15 * 86_400_000),
    property: { title: "Test Property", ownerId: HOST_ID },
    user: { firstName: "Ivan", lastName: "Guest", email: "ivan@test.com" },
    ...overrides,
  };
}

function buildRequestForFinalize(overrides: Record<string, unknown> = {}) {
  const { booking: bookingOverride, ...rest } = overrides as {
    booking?: Record<string, unknown>;
  };
  return {
    id: "req-1",
    status: "PENDING",
    autoApproved: false,
    booking: {
      id: "booking-1",
      status: "CONFIRMED",
      payoutStatus: "PENDING",
      checkIn: new Date(now + 10 * 86_400_000),
      checkOut: new Date(now + 15 * 86_400_000),
      property: {
        title: "Test Property",
        ownerId: HOST_ID,
        owner: { email: "owner@test.com", firstName: "Owner" },
      },
      user: { email: "ivan@test.com", firstName: "Ivan", lastName: "Guest" },
      payment: {
        id: "payment-1",
        amount: new Prisma.Decimal("300.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_test_123",
        metadata: null,
      },
      ...bookingOverride,
    },
    ...rest,
  };
}

beforeEach(() => {
  mockReset(mockPrisma);
  mockStripe.refunds.create.mockReset();
  mockEmailQueue.add.mockReset();
  mockEmailQueue.add.mockResolvedValue(undefined);
  mockPrisma.user.findMany.mockResolvedValue([] as never);
  mockPrisma.user.findUnique.mockResolvedValue({
    firstName: "Owner",
    lastName: "Host",
  } as never);
});

describe("HostCancellationService.requestCancellation", () => {
  it("404s when the booking is missing", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null as never);
    await expect(
      HostCancellationService.requestCancellation("booking-1", HOST_ID, "reason enough"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("403s when the requester is not the property owner", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildBookingForRequest({ property: { title: "P", ownerId: "someone-else" } }) as never,
    );
    await expect(
      HostCancellationService.requestCancellation("booking-1", HOST_ID, "reason enough"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("400s when the booking is not CONFIRMED", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildBookingForRequest({ status: "PENDING" }) as never,
    );
    await expect(
      HostCancellationService.requestCancellation("booking-1", HOST_ID, "reason enough"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400s when check-in has already started", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildBookingForRequest({ checkIn: new Date(now - 1000) }) as never,
    );
    await expect(
      HostCancellationService.requestCancellation("booking-1", HOST_ID, "reason enough"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("maps a unique-constraint violation to 409 (request already pending)", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(buildBookingForRequest() as never);
    mockPrisma.hostCancellationRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" }),
    );
    await expect(
      HostCancellationService.requestCancellation("booking-1", HOST_ID, "reason enough"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("creates the request and notifies guest + admins", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(buildBookingForRequest() as never);
    mockPrisma.hostCancellationRequest.create.mockResolvedValue({ id: "req-1" } as never);
    mockPrisma.user.findMany.mockResolvedValue([
      { email: "admin@test.com", firstName: "Admin" },
    ] as never);

    const result = await HostCancellationService.requestCancellation(
      "booking-1",
      HOST_ID,
      "The unit has a burst pipe",
    );

    expect(result).toEqual({ id: "req-1" });
    const jobNames = mockEmailQueue.add.mock.calls.map((c) => c[0]);
    expect(jobNames).toContain("host-cancel-requested-guest");
    expect(jobNames).toContain("host-cancel-requested-admin");
  });
});

describe("HostCancellationService.approve", () => {
  it("issues a full refund, cancels the booking as HOST, and approves the request", async () => {
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(
      buildRequestForFinalize() as never,
    );
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_1" } as never);
    mockPrisma.$transaction.mockImplementation((async (cb: any) => cb(mockPrisma)) as never);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as never);
    mockPrisma.hostCancellationRequest.update.mockResolvedValue({
      id: "req-1",
      status: "APPROVED",
    } as never);

    const result = await HostCancellationService.approve("req-1", ADMIN_ID);

    // Full amount, host-cancel idempotency key.
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000 }),
      { idempotencyKey: "host_cancel_refund_payment-1" },
    );
    // Booking cancelled by HOST, no payout owed.
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledBy: "HOST",
          payoutStatus: "CANCELLED",
        }),
      }),
    );
    expect(mockPrisma.hostCancellationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", resolvedById: ADMIN_ID }),
      }),
    );
    expect(mockEmailQueue.add.mock.calls.map((c) => c[0])).toContain("host-cancel-approved-guest");
    expect(result).toMatchObject({ status: "APPROVED" });
  });

  it("recovers a payment left in REFUND_PROCESSING by replaying the refund", async () => {
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(
      buildRequestForFinalize({ booking: { payment: undefined } }) as never,
    );
    // Override the payment with a REFUND_PROCESSING one (a prior finalize failed).
    const req = buildRequestForFinalize() as any;
    req.booking.payment.status = "REFUND_PROCESSING";
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(req as never);
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 } as never); // no SUCCESS row
    mockPrisma.payment.findUnique.mockResolvedValue({ status: "REFUND_PROCESSING" } as never);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_1" } as never);
    mockPrisma.$transaction.mockImplementation((async (cb: any) => cb(mockPrisma)) as never);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as never);
    mockPrisma.hostCancellationRequest.update.mockResolvedValue({
      id: "req-1",
      status: "APPROVED",
    } as never);

    await HostCancellationService.approve("req-1", ADMIN_ID);

    // Replays the same idempotency key rather than skipping the refund.
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000 }),
      { idempotencyKey: "host_cancel_refund_payment-1" },
    );
  });

  it("voids the request instead of double-cancelling when the guest already cancelled", async () => {
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(
      buildRequestForFinalize({ booking: { status: "CANCELLED" } }) as never,
    );
    mockPrisma.hostCancellationRequest.update.mockResolvedValue({
      id: "req-1",
      status: "VOIDED",
    } as never);

    const result = await HostCancellationService.approve("req-1", ADMIN_ID);

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "VOIDED" });
  });

  it("404s when the request does not exist", async () => {
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(null as never);
    await expect(HostCancellationService.approve("missing", ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("HostCancellationService.declinePending", () => {
  function buildPendingBooking(overrides: Record<string, unknown> = {}) {
    return {
      id: "booking-1",
      status: "PENDING",
      payoutStatus: "PENDING",
      checkIn: new Date(now + 10 * 86_400_000),
      checkOut: new Date(now + 15 * 86_400_000),
      property: { title: "Test Property", ownerId: HOST_ID },
      user: { email: "ivan@test.com", firstName: "Ivan" },
      payment: {
        id: "payment-1",
        amount: new Prisma.Decimal("300.00"),
        currency: "USD",
        status: "SUCCESS",
        transactionId: "pi_test_123",
        metadata: null,
      },
      ...overrides,
    };
  }

  it("403s when the caller is not the owner", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildPendingBooking({ property: { title: "P", ownerId: "other" } }) as never,
    );
    await expect(
      HostCancellationService.declinePending("booking-1", HOST_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("400s when the booking is not PENDING", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildPendingBooking({ status: "CONFIRMED" }) as never,
    );
    await expect(
      HostCancellationService.declinePending("booking-1", HOST_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refunds a paid pending booking in full and cancels it as HOST", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(buildPendingBooking() as never);
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_1" } as never);
    mockPrisma.$transaction.mockImplementation((async (cb: any) => cb(mockPrisma)) as never);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1", status: "CANCELLED" } as never);

    await HostCancellationService.declinePending("booking-1", HOST_ID);

    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000 }),
      { idempotencyKey: "host_decline_refund_payment-1" },
    );
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledBy: "HOST",
          payoutStatus: "CANCELLED",
        }),
      }),
    );
    expect(mockEmailQueue.add.mock.calls.map((c) => c[0])).toContain("host-declined-guest");
  });

  it("cancels an unpaid pending booking without calling Stripe", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      buildPendingBooking({ payment: null }) as never,
    );
    mockPrisma.$transaction.mockImplementation((async (cb: any) => cb(mockPrisma)) as never);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1", status: "CANCELLED" } as never);

    await HostCancellationService.declinePending("booking-1", HOST_ID);

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).toHaveBeenCalled();
  });
});

describe("HostCancellationService.reject", () => {
  it("marks the request REJECTED and emails the host", async () => {
    mockPrisma.hostCancellationRequest.findUnique
      .mockResolvedValueOnce({
        id: "req-1",
        booking: {
          id: "booking-1",
          checkIn: new Date(now + 10 * 86_400_000),
          checkOut: new Date(now + 15 * 86_400_000),
          property: { title: "P", owner: { email: "owner@test.com", firstName: "Owner" } },
        },
      } as never)
      .mockResolvedValueOnce({ id: "req-1", status: "REJECTED" } as never);
    mockPrisma.hostCancellationRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    await HostCancellationService.reject("req-1", ADMIN_ID, "Not a valid reason");

    expect(mockPrisma.hostCancellationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1", status: "PENDING" },
        data: expect.objectContaining({ status: "REJECTED", resolvedById: ADMIN_ID }),
      }),
    );
    expect(mockEmailQueue.add.mock.calls.map((c) => c[0])).toContain("host-cancel-rejected-host");
  });

  it("400s when the request is no longer pending", async () => {
    mockPrisma.hostCancellationRequest.findUnique
      .mockResolvedValueOnce({
        id: "req-1",
        booking: {
          id: "booking-1",
          checkIn: new Date(),
          checkOut: new Date(),
          property: { title: "P", owner: { email: "o@t.com", firstName: "O" } },
        },
      } as never)
      .mockResolvedValueOnce({ id: "req-1", status: "APPROVED" } as never);
    mockPrisma.hostCancellationRequest.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(HostCancellationService.reject("req-1", ADMIN_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("HostCancellationService.autoApproveStale", () => {
  it("no-ops when auto-approval is disabled", async () => {
    mockPrisma.platformSetting.upsert.mockResolvedValue({
      hostCancelAutoApproveEnabled: false,
      hostCancelAutoApproveDays: 7,
    } as never);

    const result = await HostCancellationService.autoApproveStale();

    expect(result).toEqual({ enabled: false, approved: 0, failed: 0 });
    expect(mockPrisma.hostCancellationRequest.findMany).not.toHaveBeenCalled();
  });

  it("approves stale pending requests when enabled", async () => {
    mockPrisma.platformSetting.upsert.mockResolvedValue({
      hostCancelAutoApproveEnabled: true,
      hostCancelAutoApproveDays: 7,
    } as never);
    mockPrisma.hostCancellationRequest.findMany.mockResolvedValue([{ id: "req-1" }] as never);
    mockPrisma.hostCancellationRequest.findUnique.mockResolvedValue(
      buildRequestForFinalize() as never,
    );
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 } as never);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_1" } as never);
    mockPrisma.$transaction.mockImplementation((async (cb: any) => cb(mockPrisma)) as never);
    mockPrisma.booking.update.mockResolvedValue({ id: "booking-1" } as never);
    mockPrisma.hostCancellationRequest.update.mockResolvedValue({
      id: "req-1",
      status: "APPROVED",
      autoApproved: true,
    } as never);

    const result = await HostCancellationService.autoApproveStale();

    expect(result).toEqual({ enabled: true, approved: 1, failed: 0 });
    // Auto-approval carries no admin id.
    expect(mockPrisma.hostCancellationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ autoApproved: true, resolvedById: null }),
      }),
    );
  });
});
