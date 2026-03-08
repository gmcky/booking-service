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

// Encoded once at module load time — avoids repeated allocations on every request
const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// TODO: Implement Magic Link unlock flow for locked accounts
// Generates a one-time token and sends it via email with a link to unlock the account.
// The token is stored in Redis with a short TTL (15 minutes) and is single-use.
// static async sendUnlockLink(email: string) {
//   const user = await prisma.user.findUnique({ where: { email } });
//   if (!user) return;  Don't reveal whether the email is registered

/**
 * AuthService handles all authentication and authorization logic
 * Implements JWT-based auth with Access + Refresh Token strategy
 */
export class AuthService {
  /**
   * Register a new user
   * @security Implement rate limiting on controller level to prevent spam
   */
  static async register(
    data: RegisterInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    // Check if user already exists (email unique constraint)
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

    // Hash password using bcrypt with salt rounds = 12
    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      // Pre-generate all IDs and do heavy CPU work BEFORE opening the transaction
      // so the DB connection is not held idle during bcrypt / JWT signing.
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

      // Transaction only performs fast DB writes — no CPU-heavy work inside
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

      // Log successful registration (structured logging)
      logger.info(
        {
          userId: user.id,
          email: user.email,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "User registered successfully",
      );

      // Return user data and tokens
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
      // Catch unique constraint violations (race condition) with generic message
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
      // Re-throw other errors
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

    // Fail fast if the account is already locked — avoids bcrypt cost on locked accounts.
    // Check is placed before DB lookup intentionally: both "wrong email" and
    // "wrong password" failures increment the same counter, so a locked response
    // does not reveal whether the email is registered.
    await this.checkLockout(email, meta);

    // Find user by email (case-insensitive)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Generic response to prevent user enumeration.
    // Increment lockout counter for unknown emails too — prevents distinguishing
    // "no account" from "wrong password" through lockout timing differences.
    if (!user) {
      logger.warn(
        { email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: user not found",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    // Verify password
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

    // Successful authentication — clear any accumulated failure counter.
    await this.clearLockout(email);

    // Pre-generate all IDs and do heavy CPU work BEFORE opening the transaction
    // so the DB connection is not held idle during bcrypt / JWT signing.
    const jti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, jti);
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Transaction only performs fast DB writes — no CPU-heavy work inside
    await prisma.$transaction(async (tx) => {
      // Persist refresh token
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

      // Cleanup expired tokens for this user
      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });

      // Keep only latest 5 tokens (multi-device support) and prune older
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
   * Logout user by invalidating refresh token
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

    // Fetch stored token by jti (unique)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
    });

    if (!storedToken) {
      // Possible reuse: revoke all tokens for user as precaution
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

    // Invalidate this token and clean expired ones for the user
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
   * Issue new access + refresh token pair using a valid refresh token.
   * Implements Refresh Token Rotation: old token is deleted, a brand-new one
   * is issued on every call — stolen tokens cannot be silently reused.
   *
   * @security If the incoming token is not found in the DB (already rotated /
   * deleted) we treat it as a reuse attack and revoke ALL tokens for that user.
   *
   * TODO: Write tests — expired token, reuse detection, rotation
   */
  static async refreshToken(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthTokens> {
    // 1. Verify JWT signature and expiry
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

    // 2. Look up token record by jti (unique)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
      include: { user: true },
    });

    if (!storedToken) {
      // Token was already rotated or deleted — treat as reuse attack.
      // Revoke every session for this user as a precaution.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token reuse detected — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // 3. Guard against DB records that somehow outlived their expiry
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: expired (DB record)",
      );
      throw new AppError(401, "Refresh token expired");
    }

    // 4. Verify the raw token matches the stored hash
    const isMatch = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isMatch) {
      // Hash mismatch with a valid jti → likely tampered token / reuse attack
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: hash mismatch — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // 5. Rotation — atomically swap old token for a new one
    const user = storedToken.user;
    const newJti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    // Heavy CPU work is done BEFORE opening the transaction so the DB connection
    // is not held idle during bcrypt / JWT signing.
    const accessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user, newJti);
    const tokenHash = await bcrypt.hash(newRefreshToken, 10);

    await prisma.$transaction(async (tx) => {
      // Delete the consumed token
      await tx.refreshToken.delete({ where: { id: storedToken.id } });

      // Persist the replacement
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

      // Opportunistic cleanup of any expired tokens for this user
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
   * Verify and decode access token
   * This is used by the auth middleware
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

    // Validate required claims
    const userId = payload.userId as string | undefined;
    const email = payload.email as string | undefined;
    const role = payload.role as string | undefined;

    if (!userId || !email || !role) {
      throw new AppError(401, "Invalid token structure");
    }

    // No DB lookup here — access tokens are stateless by design.
    // A revoked/banned user retains access until the token expires (max 15m).
    // Actual invalidation happens in refreshToken() which does hit the DB.
    // For immediate revocation, add a Redis blacklist check here instead.

    logger.debug(
      { userId, endpoint: "verifyAccessToken" },
      "Access token verified",
    );

    return { id: userId, email, role };
  }

  /**
   * Generate Access Token (short-lived)
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
   * Generate Refresh Token (long-lived)
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

  // TODO: Add method for password reset flow
  // static async requestPasswordReset(email: string)
  // static async resetPassword(token: string, newPassword: string)
  // Store reset tokens in database with expiry (15-30 minutes)

  // TODO: Add method for email verification (optional)
  // static async sendVerificationEmail(userId: string)
  // static async verifyEmail(token: string)

  // ---------------------------------------------------------------------------
  // Account lockout helpers (brute-force protection)
  // ---------------------------------------------------------------------------

  /**
   * Key schema: auth:lockout:<email>
   * Value: number of consecutive failed login attempts.
   * TTL is set on the FIRST failure and is NOT reset on subsequent ones — so
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
      // Redis unavailable — fail open so legitimate users are not locked out
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
        // Set expiry only on first failure so the window is fixed, not sliding
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
      // Best-effort — a stale counter will expire on its own
    }
  }
}
