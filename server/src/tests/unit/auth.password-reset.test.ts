import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheClient: {
    get: vi.fn(),
    set: vi.fn(),
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

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    JWT_ACCESS_SECRET: "test-access-secret-32-chars-long!!",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-long!",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCKOUT_MINUTES: 15,
    CLIENT_URL: "http://localhost:3001",
    EMAIL_FROM: "noreply@booking-service.local",
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-new-password"),
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
  return {
    SignJWT: MockSignJWT,
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  };
});

vi.mock("../../modules/auth/auth.cache.js", () => ({
  getCachedAuthUser: vi.fn().mockResolvedValue(null),
  setCachedAuthUser: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { AuthService } from "../../modules/auth/auth.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockCache = cacheClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};
const mockEmailQueueAdd = emailQueue.add as unknown as ReturnType<typeof vi.fn>;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    firstName: "Test",
    lastName: "User",
    emailVerifiedAt: null as Date | null,
    ...overrides,
  };
}

function tokenFor(userId: string, secret: string): string {
  return `${userId}.${secret}`;
}

describe("AuthService — password reset", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  describe("forgotPassword", () => {
    it("stores a hashed token and enqueues the email for an existing user", async () => {
      mockCache.incr.mockResolvedValue(1);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);

      await AuthService.forgotPassword("user@test.com");

      expect(mockCache.expire).toHaveBeenCalledWith("pwd_reset_req:user@test.com", 60 * 60);
      expect(mockCache.set).toHaveBeenCalledWith(
        "pwd_reset:user-1",
        expect.any(String),
        "EX",
        60 * 60,
      );
      expect(mockEmailQueueAdd).toHaveBeenCalledWith(
        "password-reset",
        expect.objectContaining({ to: "user@test.com" }),
      );
    });

    it("resolves silently for an unknown email — no token stored, no email enqueued", async () => {
      mockCache.incr.mockResolvedValue(1);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(AuthService.forgotPassword("ghost@test.com")).resolves.toBeUndefined();

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockEmailQueueAdd).not.toHaveBeenCalled();
    });

    it("resolves silently once the 4th request in the window trips the rate limit", async () => {
      mockCache.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);

      await AuthService.forgotPassword("user@test.com");
      await AuthService.forgotPassword("user@test.com");
      await AuthService.forgotPassword("user@test.com");
      mockEmailQueueAdd.mockClear();
      mockPrisma.user.findFirst.mockClear();

      await expect(AuthService.forgotPassword("user@test.com")).resolves.toBeUndefined();

      // Rate limit trips before the DB lookup on the 4th call.
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
      expect(mockEmailQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("happy path: hashes the new password, revokes sessions, deletes the token, clears lockout, and notifies", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      mockCache.get.mockResolvedValue(hash);
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date("2026-01-01") }) as never,
      );

      await AuthService.resetPassword(tokenFor("user-1", secret), "NewPassw0rd!23");

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "hashed-new-password", hasPassword: true },
      });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
      expect(mockCache.del).toHaveBeenCalledWith("pwd_reset:user-1");
      expect(mockCache.del).toHaveBeenCalledWith("auth:lockout:user@test.com");
      expect(mockEmailQueueAdd).toHaveBeenCalledWith(
        "password-changed-notification",
        expect.objectContaining({ email: "user@test.com", firstName: "Test" }),
      );
    });

    it("sets emailVerifiedAt when it was null", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      mockCache.get.mockResolvedValue(hash);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ emailVerifiedAt: null }) as never);

      await AuthService.resetPassword(tokenFor("user-1", secret), "NewPassw0rd!23");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          passwordHash: "hashed-new-password",
          hasPassword: true,
          emailVerifiedAt: expect.any(Date),
        },
      });
    });

    it("does not touch emailVerifiedAt when it is already set", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      mockCache.get.mockResolvedValue(hash);
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date("2026-01-01") }) as never,
      );

      await AuthService.resetPassword(tokenFor("user-1", secret), "NewPassw0rd!23");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "hashed-new-password", hasPassword: true },
      });
    });

    it("rejects reuse of the same token after a successful reset (Redis key already deleted)", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      const token = tokenFor("user-1", secret);

      mockCache.get.mockResolvedValueOnce(hash);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);
      await AuthService.resetPassword(token, "NewPassw0rd!23");

      mockCache.get.mockResolvedValueOnce(null);
      await expect(AuthService.resetPassword(token, "AnotherPassw0rd!23")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects a tampered secret (wrong secret for a real user id)", async () => {
      const realSecret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(realSecret).digest("hex");
      mockCache.get.mockResolvedValue(hash);

      const tamperedSecret = randomBytes(32).toString("base64url");
      await expect(
        AuthService.resetPassword(tokenFor("user-1", tamperedSecret), "NewPassw0rd!23"),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a malformed token with no separator", async () => {
      await expect(
        AuthService.resetPassword("not-a-valid-token", "NewPassw0rd!23"),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it("rejects when the Redis key is missing (expired or never issued)", async () => {
      mockCache.get.mockResolvedValue(null);

      await expect(
        AuthService.resetPassword(tokenFor("user-1", "some-secret"), "NewPassw0rd!23"),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects when the token has an empty userId or secret segment", async () => {
      await expect(
        AuthService.resetPassword(".just-a-secret", "NewPassw0rd!23"),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(AuthService.resetPassword("user-1.", "NewPassw0rd!23")).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockCache.get).not.toHaveBeenCalled();
    });
  });
});
