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

import bcrypt from "bcrypt";
import { prisma } from "../../shared/lib/prisma.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { AuthService } from "../../modules/auth/auth.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockCache = cacheClient as unknown as { get: ReturnType<typeof vi.fn> };
const mockCompare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

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
    emailVerifiedAt: new Date(),
    ...overrides,
  };
}

describe("AuthService.login — user enumeration hardening", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
  });

  it("uses a well-formed cost-12 bcrypt hash for the timing dummy", async () => {
    // Guards the timing fix: a malformed constant makes bcrypt.compare return
    // false instantly, silently reopening the enumeration gap. The real hash
    // lives in auth.service; assert the format it must keep.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../modules/auth/auth.service.ts", import.meta.url), "utf8"),
    );
    const match = source.match(/DUMMY_PASSWORD_HASH\s*=\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  });

  it("still runs a bcrypt compare when the email is unknown (timing parity)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid credentials",
    });
    expect(mockCompare).toHaveBeenCalledTimes(1);
  });

  it("returns Invalid credentials (not a suspension notice) on wrong password for a suspended account", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ isSuspended: true }));
    mockCompare.mockResolvedValueOnce(false as never);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid credentials",
    });
  });

  it("discloses suspension only once the password is correct", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ isSuspended: true }));
    mockCompare.mockResolvedValueOnce(true as never);

    await expect(AuthService.login(LOGIN_INPUT)).rejects.toMatchObject({
      statusCode: 403,
      message: "Account is suspended",
    });
  });
});
