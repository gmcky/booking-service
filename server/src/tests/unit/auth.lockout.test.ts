import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheClient: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
  },
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheInvalidateNamespace: vi.fn(),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  hashKey: vi.fn(() => "hash"),
}));

vi.mock("../../shared/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    JWT_ACCESS_SECRET: "test-access-secret-32-chars-long!!",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-long!",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCKOUT_MINUTES: 15,
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("jose", () => {
  class MockSignJWT {
    setProtectedHeader() {
      return this;
    }
    setJti() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setAudience() {
      return this;
    }
    setNotBefore() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return "mock-jwt-token";
    }
  }
  return { SignJWT: MockSignJWT, jwtVerify: vi.fn() };
});

vi.mock("../../modules/auth/auth.cache.js", () => ({
  getCachedAuthUser: vi.fn().mockResolvedValue(null),
  setCachedAuthUser: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { AuthService } from "../../modules/auth/auth.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockCache = cacheClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};

const LOGIN_INPUT = { email: "user@test.com", password: "Correct!Pass1" };

function makeUser(overrides = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    passwordHash: "hashed-password",
    firstName: "Test",
    lastName: "User",
    role: "USER" as const,
    isDeleted: false,
    isSuspended: false,
    phoneNumber: null,
    dateOfBirth: null,
    bio: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("AuthService — brute-force lockout", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("blocks login with 429 when attempt count reaches LOGIN_MAX_ATTEMPTS", async () => {
    mockCache.get.mockResolvedValue("5");
    mockCache.ttl.mockResolvedValue(600);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("5 failed attempts then correct password still rejected on 6th try", async () => {
    // Simulate: counter already at max from 5 prior failures.
    mockCache.get.mockResolvedValue("5");
    mockCache.ttl.mockResolvedValue(840);

    await expect(
      AuthService.login({ email: "user@test.com", password: "Correct!Pass1" }),
    ).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("increments Redis counter on wrong password", async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.incr.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(1);

    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    const bcrypt = await import("bcrypt");
    vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as never);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(mockCache.incr).toHaveBeenCalledWith(expect.stringContaining("user@test.com"));
  });

  it("sets TTL on first failure (fixed-window start)", async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.incr.mockResolvedValue(1);
    mockCache.expire.mockResolvedValue(1);

    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    const bcrypt = await import("bcrypt");
    vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as never);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(mockCache.expire).toHaveBeenCalledWith(
      expect.stringContaining("user@test.com"),
      15 * 60,
    );
  });

  it("does not set TTL on subsequent failures (fixed window, not sliding)", async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.incr.mockResolvedValue(3);
    mockCache.expire.mockResolvedValue(1);

    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    const bcrypt = await import("bcrypt");
    vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as never);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(mockCache.expire).not.toHaveBeenCalled();
  });

  it("clears lockout counter on successful login", async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.del.mockResolvedValue(1);

    const user = makeUser();
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
      typeof cb === "function" ? cb(mockPrisma) : undefined,
    );
    mockPrisma.refreshToken.create.mockResolvedValue({} as never);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.refreshToken.findMany.mockResolvedValue([]);

    await AuthService.login(LOGIN_INPUT);

    expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining("user@test.com"));
  });

  it("allows login when attempt count is below threshold", async () => {
    mockCache.get.mockResolvedValue("2");
    mockCache.del.mockResolvedValue(1);

    const user = makeUser();
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
      typeof cb === "function" ? cb(mockPrisma) : undefined,
    );
    mockPrisma.refreshToken.create.mockResolvedValue({} as never);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.refreshToken.findMany.mockResolvedValue([]);

    const result = await AuthService.login(LOGIN_INPUT);

    expect(result.accessToken).toBe("mock-jwt-token");
  });
});
