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
    GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-dummy-password"),
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

import bcrypt from "bcrypt";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { jwtVerify } from "jose";
import { prisma } from "../../shared/lib/prisma.js";
import { AuthService } from "../../modules/auth/auth.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockJwtVerify = jwtVerify as unknown as ReturnType<typeof vi.fn>;
const mockCompare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

const GOOGLE_INPUT = { credential: "fake.google.credential" };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    passwordHash: "hashed-password",
    googleId: null,
    hasPassword: true,
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

function makeGooglePayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "google-sub-123",
    email: "newuser@test.com",
    email_verified: true,
    given_name: "Ada",
    family_name: "Lovelace",
    picture: "https://example.com/avatar.jpg",
    ...overrides,
  };
}

function mockSessionTransaction() {
  // Handles both $transaction forms used in these flows: the interactive
  // callback (session issuance) and the array batch (unverified-link scrub).
  mockPrisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? arg(mockPrisma) : Array.isArray(arg) ? Promise.all(arg) : undefined,
  );
  mockPrisma.refreshToken.create.mockResolvedValue({} as never);
  mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.refreshToken.findMany.mockResolvedValue([]);
}

describe("AuthService.googleAuth", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("creates a new account on first sign-in (email verified, no password set)", async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeGooglePayload() });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(
      makeUser({
        id: "new-user",
        email: "newuser@test.com",
        googleId: "google-sub-123",
        hasPassword: false,
        firstName: "Ada",
        lastName: "Lovelace",
        avatarUrl: "https://example.com/avatar.jpg",
        emailVerifiedAt: new Date(),
      }) as never,
    );
    mockSessionTransaction();

    const result = await AuthService.googleAuth(GOOGLE_INPUT);

    expect(result.accessToken).toBe("mock-jwt-token");
    expect(result.user.emailVerified).toBe(true);

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const createArgs = mockPrisma.user.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.hasPassword).toBe(false);
    expect(createArgs.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(createArgs.data.googleId).toBe("google-sub-123");
    expect(createArgs.data.email).toBe("newuser@test.com");
  });

  it("auto-links an existing account found by email instead of creating a new one", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeGooglePayload({ email: "user@test.com" }),
    });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(makeUser() as never);
    mockPrisma.user.update.mockResolvedValue(makeUser({ googleId: "google-sub-123" }) as never);
    mockSessionTransaction();

    await AuthService.googleAuth(GOOGLE_INPUT);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { googleId: "google-sub-123" },
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("takes over an UNVERIFIED account on link: scrubs password, verifies email, revokes sessions", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeGooglePayload({ email: "user@test.com" }),
    });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ emailVerifiedAt: null }) as never);
    mockPrisma.user.update.mockResolvedValue(
      makeUser({ googleId: "google-sub-123", hasPassword: false }) as never,
    );
    mockSessionTransaction();

    await AuthService.googleAuth(GOOGLE_INPUT);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        googleId: "google-sub-123",
        emailVerifiedAt: expect.any(Date),
        passwordHash: "hashed-dummy-password",
        hasPassword: false,
      },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent-create race (P2002) by re-reading the winner", async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeGooglePayload() });
    const winner = makeUser({
      id: "winner",
      email: "newuser@test.com",
      googleId: "google-sub-123",
      hasPassword: false,
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner as never);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockRejectedValue(
      new PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    mockSessionTransaction();

    const result = await AuthService.googleAuth(GOOGLE_INPUT);

    expect(result.accessToken).toBe("mock-jwt-token");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects with 401 when credential verification fails", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));

    await expect(AuthService.googleAuth(GOOGLE_INPUT)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid Google credential",
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects with 401 when Google reports the email as unverified", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeGooglePayload({ email_verified: false }),
    });

    await expect(AuthService.googleAuth(GOOGLE_INPUT)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid Google credential",
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the matched account is suspended", async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeGooglePayload() });
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ googleId: "google-sub-123", isSuspended: true }) as never,
    );

    await expect(AuthService.googleAuth(GOOGLE_INPUT)).rejects.toMatchObject({
      statusCode: 403,
      message: "Account is suspended",
    });
  });

  it("rejects a soft-deleted account found by googleId without touching email lookup or create", async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeGooglePayload() });
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ googleId: "google-sub-123", isDeleted: true }) as never,
    );

    await expect(AuthService.googleAuth(GOOGLE_INPUT)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid Google credential",
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("signs in an existing Google-linked account on repeat sign-in", async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeGooglePayload() });
    mockPrisma.user.findUnique.mockResolvedValue(
      makeUser({ googleId: "google-sub-123", hasPassword: false }) as never,
    );
    mockSessionTransaction();

    const result = await AuthService.googleAuth(GOOGLE_INPUT);

    expect(result.accessToken).toBe("mock-jwt-token");
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.login — Google-only accounts", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("returns the Google sign-in hint and skips bcrypt for a password-less account", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ hasPassword: false, passwordHash: "unusable-dummy-hash" }) as never,
    );

    await expect(
      AuthService.login({ email: "user@test.com", password: "whatever123" }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "This account uses Google sign-in. Use the Google button to log in.",
    });
    expect(mockCompare).not.toHaveBeenCalled();
  });
});
