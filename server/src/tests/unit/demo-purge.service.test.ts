import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Overrides global setup.ts mocks with deep mocks needed for this test file.
vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    DEMO_CLEANUP_ENABLED: true,
  },
}));

import { prisma } from "../../shared/lib/prisma.js";
import { env } from "../../config/env.js";
import { purgeDemoData } from "../../shared/lib/demo-purge.service.js";
import {
  DEMO_USER_EMAIL,
  PROTECTED_EMAILS,
  PROTECTED_EMAIL_DOMAINS,
} from "../../shared/constants/demo-cleanup.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockEnv = env as { DEMO_CLEANUP_ENABLED: boolean };

const emptyCounts = { count: 0 };

function primeTxMocks() {
  // Service runs one transaction per user; tx receives the same deep mock.
  mockPrisma.$transaction.mockImplementation(async (fn: unknown) =>
    (fn as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma),
  );
  mockPrisma.review.updateMany.mockResolvedValue(emptyCounts);
  mockPrisma.reviewReport.deleteMany.mockResolvedValue(emptyCounts);
  mockPrisma.review.deleteMany.mockResolvedValue(emptyCounts);
  mockPrisma.booking.deleteMany.mockResolvedValue(emptyCounts);
  mockPrisma.property.deleteMany.mockResolvedValue(emptyCounts);
  mockPrisma.user.delete.mockResolvedValue({} as never);
}

describe("purgeDemoData", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    mockEnv.DEMO_CLEANUP_ENABLED = true;
    primeTxMocks();
  });

  it("skips entirely when DEMO_CLEANUP_ENABLED is false", async () => {
    mockEnv.DEMO_CLEANUP_ENABLED = false;

    await purgeDemoData();

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("targets users by email, excluding protected accounts and seed domains", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await purgeDemoData();

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: { notIn: [...PROTECTED_EMAILS] },
        NOT: PROTECTED_EMAIL_DOMAINS.map((domain) => ({
          email: { endsWith: `@${domain}` },
        })),
      },
      select: { id: true, email: true },
    });
  });

  it("wipes demo user data but keeps the row; hard-deletes visitor accounts", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "demo-id", email: DEMO_USER_EMAIL },
      { id: "visitor-id", email: "visitor@example.com" },
    ] as never);

    await purgeDemoData();

    expect(mockPrisma.booking.deleteMany).toHaveBeenCalledWith({
      where: { userId: "demo-id" },
    });
    expect(mockPrisma.user.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "visitor-id" } });
  });

  it("clears all host reply columns together to satisfy the consistency check", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "visitor-id", email: "visitor@example.com" },
    ] as never);

    await purgeDemoData();

    expect(mockPrisma.review.updateMany).toHaveBeenCalledWith({
      where: { hostReplyById: "visitor-id" },
      data: { hostReplyText: null, hostReplyCreatedAt: null, hostReplyById: null },
    });
  });

  it("continues with remaining users when one purge transaction fails", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "bad-id", email: "bad@example.com" },
      { id: "good-id", email: "good@example.com" },
    ] as never);
    mockPrisma.$transaction
      .mockRejectedValueOnce(new Error("tx failed"))
      .mockImplementation(async (fn: unknown) =>
        (fn as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma),
      );

    await purgeDemoData();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "good-id" } });
  });
});
