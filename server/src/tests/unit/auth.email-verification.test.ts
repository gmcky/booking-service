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

describe("AuthService — email verification", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  describe("verifyEmail", () => {
    it("happy path: matching token marks the user verified and deletes the Redis key", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      mockCache.get.mockResolvedValue(hash);
      mockPrisma.user.update.mockResolvedValue(makeUser({ emailVerifiedAt: new Date() }) as never);

      await AuthService.verifyEmail(tokenFor("user-1", secret));

      expect(mockCache.get).toHaveBeenCalledWith("email_verify:user-1");
      expect(mockCache.del).toHaveBeenCalledWith("email_verify:user-1");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it("rejects when the Redis key is missing (expired or never issued)", async () => {
      mockCache.get.mockResolvedValue(null);

      await expect(
        AuthService.verifyEmail(tokenFor("user-1", "some-secret")),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a malformed token with no separator", async () => {
      await expect(AuthService.verifyEmail("not-a-valid-token")).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it("rejects on secret mismatch (wrong secret for a real user id)", async () => {
      const realSecret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(realSecret).digest("hex");
      mockCache.get.mockResolvedValue(hash);

      const wrongSecret = randomBytes(32).toString("base64url");
      await expect(AuthService.verifyEmail(tokenFor("user-1", wrongSecret))).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("second verify with the same token fails (Redis key already deleted)", async () => {
      const secret = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(secret).digest("hex");
      const token = tokenFor("user-1", secret);

      mockCache.get.mockResolvedValueOnce(hash);
      mockPrisma.user.update.mockResolvedValue(makeUser({ emailVerifiedAt: new Date() }) as never);
      await AuthService.verifyEmail(token);

      // Second attempt: Redis key is gone (deleted after first success).
      mockCache.get.mockResolvedValueOnce(null);
      await expect(AuthService.verifyEmail(token)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("resendVerificationEmail", () => {
    it("rotates the token and enqueues a new email when unverified", async () => {
      mockCache.incr.mockResolvedValue(1);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);

      await AuthService.resendVerificationEmail("user-1");

      expect(mockCache.expire).toHaveBeenCalledWith("verify_resend:user-1", 60 * 60);
      expect(mockCache.set).toHaveBeenCalledWith(
        "email_verify:user-1",
        expect.any(String),
        "EX",
        24 * 60 * 60,
      );
      expect(mockEmailQueueAdd).toHaveBeenCalledWith(
        "verify-email",
        expect.objectContaining({ to: "user@test.com" }),
      );
    });

    it("no-op when already verified: no token rotation, no email enqueued", async () => {
      mockCache.incr.mockResolvedValue(1);
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() }) as never,
      );

      await AuthService.resendVerificationEmail("user-1");

      expect(mockCache.set).not.toHaveBeenCalled();
      expect(mockEmailQueueAdd).not.toHaveBeenCalled();
    });

    it("blocks the 4th resend within the window with 429", async () => {
      mockCache.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);

      await AuthService.resendVerificationEmail("user-1");
      await AuthService.resendVerificationEmail("user-1");
      await AuthService.resendVerificationEmail("user-1");

      await expect(AuthService.resendVerificationEmail("user-1")).rejects.toMatchObject({
        statusCode: 429,
      });
      // Rate limit trips before the DB lookup on the 4th call.
      expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(3);
    });
  });
});
