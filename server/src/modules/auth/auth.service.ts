import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { parseExpiry } from "../../shared/utils/time.js";
import type {
  RegisterInput,
  LoginInput,
  AuthResponse,
  AuthTokens,
} from "./auth.types.js";
import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import type { User } from "@prisma/client";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

// Encoded at module load time to avoid per-request allocations.
const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// TODO: Add magic-link unlock flow for locked accounts.

/**
 * Authentication and authorization service.
 * Uses JWT access tokens and rotating refresh tokens.
 */
export class AuthService {
  /**
   * Register a new user.
   * @security Controller-level rate limiting should protect this endpoint.
   */
  static async register(
    data: RegisterInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email.toLowerCase() },
          ...(data.phoneNumber ? [{ phoneNumber: data.phoneNumber }] : []),
        ],
      },
    });

    if (existingUser) {
      logger.warn(
        {
          email: data.email.toLowerCase(),
          phoneNumber: data.phoneNumber,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "Registration rejected: duplicate account",
      );
      throw new AppError(409, "Registration failed");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      // Run CPU-heavy operations before opening a DB transaction.
      const userId = crypto.randomUUID();
      const jti = crypto.randomUUID();
      const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
      const expiresAt = new Date(Date.now() + refreshExpiresIn);

      const email = data.email.toLowerCase();
      const accessToken = await this.generateAccessToken({
        id: userId,
        email,
        role: "USER",
      });
      const refreshToken = await this.generateRefreshToken({ id: userId }, jti);
      const tokenHash = await bcrypt.hash(refreshToken, 10);

      // Keep the transaction focused on fast DB writes only.
      const user = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber || null,
            role: "USER",
          },
        });

        await tx.refreshToken.create({
          data: {
            tokenHash,
            jti,
            userId,
            expiresAt,
            ip: meta?.ip || null,
            userAgent: meta?.userAgent || null,
          },
        });

        return user;
      });

      logger.info(
        {
          userId: user.id,
          email: user.email,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "User registered successfully",
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      // Handle concurrent duplicate registration attempts consistently.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          logger.warn(
            {
              email: data.email.toLowerCase(),
              phoneNumber: data.phoneNumber,
              ip: meta?.ip,
              userAgent: meta?.userAgent,
              code: error.code,
            },
            "Registration failed due to unique constraint",
          );
          throw new AppError(409, "Registration failed");
        }
      }
      throw error;
    }
  }

  /**
   * Authenticate user and issue tokens.
   * Protected by:
   *   1. IP-based rate limiting in app.ts (express-rate-limit + Redis)
   *   2. Per-email account lockout after LOGIN_MAX_ATTEMPTS failures (Redis)
   */
  static async login(
    data: LoginInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const email = data.email.toLowerCase();

    // Check lockout before password verification to avoid unnecessary bcrypt work
    // and keep failure behavior consistent for existing and non-existing accounts.
    await this.checkLockout(email, meta);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Use a uniform invalid-credentials response to reduce user enumeration risk.
    if (!user) {
      logger.warn(
        { email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: user not found",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: invalid password",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    // Clear lockout counter after successful authentication.
    await this.clearLockout(email);

    // Run CPU-heavy operations before opening a DB transaction.
    const jti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, jti);
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Keep the transaction focused on token persistence and cleanup.
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          tokenHash,
          jti,
          userId: user.id,
          expiresAt,
          ip: meta?.ip || null,
          userAgent: meta?.userAgent || null,
        },
      });

      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });

      // Retain recent sessions and prune older refresh tokens.
      const tokensToPrune = await tx.refreshToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: 5,
        select: { id: true },
      });

      if (tokensToPrune.length) {
        await tx.refreshToken.deleteMany({
          where: { id: { in: tokensToPrune.map((t) => t.id) } },
        });
      }
    });

    logger.info(
      { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
      "User logged in",
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout user by invalidating the refresh token.
   */
  static async logout(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    if (!refreshToken) {
      throw new AppError(401, "No refresh token provided");
    }

    let payload;
    try {
      const verification = await jwtVerify(refreshToken, REFRESH_SECRET, {
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      logger.warn(
        {
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          error: (error as Error).message,
        },
        "Logout failed: invalid refresh token (signature)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const jti = payload.jti as string | undefined;
    const userId = payload.userId as string | undefined;

    if (!jti || !userId) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent },
        "Logout failed: refresh token missing jti or userId",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
    });

    if (!storedToken) {
      // Treat missing token record as possible token reuse.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Logout failed: refresh token reuse detected (missing stored token)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const isMatch = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isMatch) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        {
          userId: storedToken.userId,
          jti,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "Logout failed: refresh token hash mismatch (reuse)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // Revoke the current token and remove expired tokens.
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: storedToken.id } }),
      prisma.refreshToken.deleteMany({
        where: {
          userId: storedToken.userId,
          expiresAt: { lt: new Date() },
        },
      }),
    ]);

    logger.info(
      {
        userId: storedToken.userId,
        jti,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
      "User logged out",
    );
  }

  /**
   * Issue a new access/refresh token pair from a valid refresh token.
   * Refresh token rotation is enforced on every successful call.
   *
   * @security Missing refresh token records are treated as potential reuse and
   * trigger revocation of all refresh tokens for that user.
   *
   * TODO: Add tests for expiry, reuse detection, and token rotation.
   */
  static async refreshToken(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthTokens> {
    let payload;
    try {
      const verification = await jwtVerify(refreshToken, REFRESH_SECRET, {
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      logger.warn(
        {
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          error: (error as Error).message,
        },
        "Refresh token rejected: invalid signature or expired JWT",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const jti = payload.jti as string | undefined;
    const userId = payload.userId as string | undefined;

    if (!jti || !userId) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: missing jti or userId claim",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
      include: { user: true },
    });

    if (!storedToken) {
      // Token was already rotated or deleted; treat as potential reuse.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token reuse detected — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // Guard against stale DB records that outlived expiry.
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: expired (DB record)",
      );
      throw new AppError(401, "Refresh token expired");
    }

    const isMatch = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isMatch) {
      // Hash mismatch with valid jti indicates possible tampering or reuse.
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: hash mismatch — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // Rotate token atomically.
    const user = storedToken.user;
    const newJti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    // Run CPU-heavy operations before opening a DB transaction.
    const accessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user, newJti);
    const tokenHash = await bcrypt.hash(newRefreshToken, 10);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: storedToken.id } });

      await tx.refreshToken.create({
        data: {
          tokenHash,
          jti: newJti,
          userId: user.id,
          expiresAt,
          ip: meta?.ip ?? null,
          userAgent: meta?.userAgent ?? null,
        },
      });

      // Opportunistic cleanup of expired tokens for this user.
      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });
    });

    logger.info(
      {
        userId: user.id,
        oldJti: jti,
        newJti,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
      "Refresh token rotated",
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Verify and decode an access token for auth middleware.
   */
  static async verifyAccessToken(
    token: string,
  ): Promise<{ id: string; email: string; role: string }> {
    let payload;
    try {
      const verification = await jwtVerify(token, ACCESS_SECRET, {
        algorithms: ["HS256"],
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "ERR_JWT_EXPIRED") {
        throw new AppError(401, "Token expired");
      }
      throw new AppError(401, "Invalid token");
    }

    const userId = payload.userId as string | undefined;
    const email = payload.email as string | undefined;
    const role = payload.role as string | undefined;

    if (!userId || !email || !role) {
      throw new AppError(401, "Invalid token structure");
    }

    // Access tokens remain stateless; revocation is enforced at refresh-token level.
    // For immediate revocation, add a token blacklist check.

    logger.debug(
      { userId, endpoint: "verifyAccessToken" },
      "Access token verified",
    );

    return { id: userId, email, role };
  }

  /**
   * Generate a short-lived access token.
   */
  private static async generateAccessToken(
    user: Pick<User, "id" | "email" | "role">,
  ): Promise<string> {
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("booking-service")
      .setAudience("booking-api")
      .setNotBefore("0s")
      .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
      .sign(ACCESS_SECRET);

    return token;
  }

  /**
   * Generate a long-lived refresh token.
   */
  private static async generateRefreshToken(
    user: Pick<User, "id">,
    jti: string,
  ): Promise<string> {
    const token = await new SignJWT({
      userId: user.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(jti)
      .setIssuedAt()
      .setIssuer("booking-service")
      .setAudience("booking-api")
      .setNotBefore("0s")
      .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
      .sign(REFRESH_SECRET);

    return token;
  }

  // TODO: Add password reset flow methods.

  // TODO: Add email verification methods.

  // Account lockout helpers (brute-force protection).

  /**
   * Key schema: auth:lockout:<email>
   * Value: number of consecutive failed login attempts.
   * TTL is set on the first failure and is not reset on subsequent ones, so
   * the window always expires relative to the first bad attempt, not the last.
   */
  private static lockoutKey(email: string): string {
    return `auth:lockout:${email}`;
  }

  /**
   * Throws 429 if the account is currently locked.
   * Fails open when Redis is unavailable to avoid blocking legitimate logins.
   */
  private static async checkLockout(
    email: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    try {
      const raw = await cacheClient.get(this.lockoutKey(email));
      if (!raw) return;

      const attempts = parseInt(raw, 10);
      if (attempts >= env.LOGIN_MAX_ATTEMPTS) {
        const ttl = await cacheClient.ttl(this.lockoutKey(email));
        const minutesLeft =
          ttl > 0 ? Math.ceil(ttl / 60) : env.LOGIN_LOCKOUT_MINUTES;
        logger.warn(
          { email, attempts, ttl, ip: meta?.ip, userAgent: meta?.userAgent },
          "Login blocked: account is locked",
        );
        throw new AppError(
          429,
          `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Fail open when Redis is unavailable to avoid blocking legitimate users.
      logger.warn(
        { email, error: (error as Error).message },
        "Lockout check skipped — Redis unavailable",
      );
    }
  }

  /**
   * Increments the failed-attempt counter for the given email.
   * Sets the TTL only on the first failure (so the window doesn't slide).
   * Logs a warning when the lockout threshold is reached.
   */
  private static async recordFailedAttempt(
    email: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    try {
      const key = this.lockoutKey(email);
      const attempts = await cacheClient.incr(key);
      if (attempts === 1) {
        // Set expiry only on first failure so the window remains fixed.
        await cacheClient.expire(key, env.LOGIN_LOCKOUT_MINUTES * 60);
      }
      if (attempts >= env.LOGIN_MAX_ATTEMPTS) {
        logger.warn(
          { email, attempts, ip: meta?.ip, userAgent: meta?.userAgent },
          `Account locked after ${attempts} failed login attempts`,
        );
      }
    } catch (error) {
      logger.warn(
        { email, error: (error as Error).message },
        "Failed to record login attempt — Redis unavailable",
      );
    }
  }

  /** Clears the lockout counter on successful authentication. */
  private static async clearLockout(email: string): Promise<void> {
    try {
      await cacheClient.del(this.lockoutKey(email));
    } catch {
      // Best effort; stale counters will expire automatically.
    }
  }
}
