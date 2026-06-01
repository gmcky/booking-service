import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { parseExpiry } from "../../shared/utils/time.js";
import type { RegisterInput, LoginInput, AuthResponse, AuthTokens } from "./auth.types.js";
import { getCachedAuthUser, setCachedAuthUser } from "./auth.cache.js";
import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import type { User } from "@prisma/client";
import crypto from "crypto";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

// Pre-encode once; avoids per-request TextEncoder churn.
const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export class AuthService {
  /**
   * Atomic user creation and initial refresh session.
   */
  static async register(
    data: RegisterInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findFirst({
      where: {
        isDeleted: false,
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
      // Crypto/bcrypt kept outside tx to reduce lock time.
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
      const tokenHash = this.hashToken(refreshToken);

      // Write-only DB ops for predictable tx latency.
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
      // Normalize unique-constraint conflicts.
      if (error instanceof PrismaClientKnownRequestError) {
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
   * Credential validation with lockout guards and session issuance.
   */
  static async login(
    data: LoginInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const email = data.email.toLowerCase();

    // Short-circuit before bcrypt to block enumeration.
    await this.checkLockout(email, meta);

    const user = await prisma.user.findFirst({
      where: {
        email,
        isDeleted: false,
      },
    });

    // Consistent 401 response for absent user or bad password.
    if (!user || !user.passwordHash) {
      logger.warn(
        { email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: user not found",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    if (user.isSuspended) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login blocked: account is suspended",
      );
      throw new AppError(403, "Account is suspended");
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValidPassword) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: invalid password",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    await this.clearLockout(email);

    const jti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, jti);
    const tokenHash = this.hashToken(refreshToken);

    // Persist session and prune stale/excess tokens in one batch.
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

      // Cap active sessions to prevent unbounded growth.
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
   * Session revocation via refresh token invalidation.
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
        algorithms: ["HS256"],
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
      // Token missing from DB usually indicates rotation race or reuse.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Logout failed: refresh token reuse detected (missing stored token)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const isMatch = this.hashToken(refreshToken) === storedToken.tokenHash;
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
   * Token rotation with nuke-on-reuse protection.
   */
  static async refreshToken(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthTokens> {
    let payload;
    try {
      const verification = await jwtVerify(refreshToken, REFRESH_SECRET, {
        algorithms: ["HS256"],
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
      // Reuse signal: missing jti on refresh triggers full session revocation.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token reuse detected — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    if (storedToken.user.isDeleted || storedToken.user.isSuspended) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId: storedToken.userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: user is disabled",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // Defensive cleanup for JWTs that outlived DB records.
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: expired (DB record)",
      );
      throw new AppError(401, "Refresh token expired");
    }

    const isMatch = this.hashToken(refreshToken) === storedToken.tokenHash;
    if (!isMatch) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: hash mismatch — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const user = storedToken.user;
    const newJti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user, newJti);
    const tokenHash = this.hashToken(newRefreshToken);

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

    const cached = await getCachedAuthUser(userId);
    if (cached) {
      logger.debug({ userId, endpoint: "verifyAccessToken" }, "Access token verified (cache hit)");
      return cached;
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false, isSuspended: false },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new AppError(401, "Invalid token");
    }

    await setCachedAuthUser({ id: user.id, email: user.email, role: user.role });

    logger.debug({ userId, endpoint: "verifyAccessToken" }, "Access token verified");

    return { id: user.id, email: user.email, role: user.role };
  }

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

  private static async generateRefreshToken(user: Pick<User, "id">, jti: string): Promise<string> {
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

  private static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  // Fixed-window lockout key; TTL anchored to first failure (non-sliding window).
  private static lockoutKey(email: string): string {
    return `auth:lockout:${email}`;
  }

  // Fail-open on Redis outage; auth should degrade, not hard-stop.
  // Trade-off: We prioritize user availability over strict security during a cache outage.
  // In a high-security environment, we might consider a fail-closed approach or a
  // secondary in-memory fallback (e.g., a LRU cache) to maintain partial protection.
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
        const minutesLeft = ttl > 0 ? Math.ceil(ttl / 60) : env.LOGIN_LOCKOUT_MINUTES;
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
      logger.warn(
        { email, error: (error as Error).message },
        "Lockout check skipped — Redis unavailable",
      );
    }
  }

  // TTL set once to keep lockout as fixed window, not sliding window.
  private static async recordFailedAttempt(
    email: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    try {
      const key = this.lockoutKey(email);
      const attempts = await cacheClient.incr(key);
      if (attempts === 1) {
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

  private static async clearLockout(email: string): Promise<void> {
    try {
      await cacheClient.del(this.lockoutKey(email));
    } catch {
      // Best-effort cleanup; stale counters self-expire via TTL.
    }
  }
}
