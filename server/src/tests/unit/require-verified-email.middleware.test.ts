import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { requireVerifiedEmail } from "../../shared/middlewares/auth.js";
import { AppError } from "../../shared/middlewares/error.handler.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

function makeReq(userId?: string): Request {
  return {
    user: userId ? { id: userId, email: "u@test.com", role: "USER" } : undefined,
  } as Request;
}

describe("requireVerifiedEmail middleware", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
  });

  it("calls next() with a 403 EMAIL_NOT_VERIFIED AppError when the user has not verified", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null } as never);
    const next = vi.fn() as NextFunction;

    await requireVerifiedEmail(makeReq("user-1"), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(errorArg).toBeInstanceOf(AppError);
    expect(errorArg.statusCode).toBe(403);
    expect(errorArg.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("passes through cleanly when the user is verified", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() } as never);
    const next = vi.fn() as NextFunction;

    await requireVerifiedEmail(makeReq("user-1"), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeUndefined();
  });

  it("rejects with 401 when no authenticated user is present on the request", async () => {
    const next = vi.fn() as NextFunction;

    await requireVerifiedEmail(makeReq(undefined), {} as Response, next);

    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(errorArg).toBeInstanceOf(AppError);
    expect(errorArg.statusCode).toBe(401);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
