import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
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
      // Generate token metadata before transaction
      const jti = crypto.randomUUID();
      const refreshExpiresIn = this.parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
      const expiresAt = new Date(Date.now() + refreshExpiresIn);

      // Wrap user + refresh token creation in transaction for atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create user in database
        const user = await tx.user.create({
          data: {
            email: data.email.toLowerCase(),
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber || null,
            role: "USER",
          },
        });

        // Generate JWT tokens (Access + Refresh)
        const accessToken = await this.generateAccessToken(user);
        const refreshToken = await this.generateRefreshToken(user, jti);

        // Hash refresh token before storing (prevent token leakage)
        const tokenHash = await bcrypt.hash(refreshToken, 10);

        // Store hashed refresh token with jti in database
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

        return { user, accessToken, refreshToken };
      });

      // Log successful registration (structured logging)
      logger.info(
        {
          userId: result.user.id,
          email: result.user.email,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "User registered successfully",
      );

      // Return user data and tokens
      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
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
   * Authenticate user and issue tokens
   * @security Implement account lockout after N failed attempts (store in Redis or DB)
   */
  static async login(
    data: LoginInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const email = data.email.toLowerCase();

    // Find user by email (case-insensitive)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Generic response to prevent enumeration
    if (!user) {
      logger.warn(
        { email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: user not found",
      );
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
      throw new AppError(401, "Invalid credentials");
    }

    // Prepare tokens and metadata
    const jti = crypto.randomUUID();
    const refreshExpiresIn = this.parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const { accessToken, refreshToken } = await prisma.$transaction(
      async (tx) => {
        const accessToken = await this.generateAccessToken(user);
        const refreshToken = await this.generateRefreshToken(user, jti);
        const tokenHash = await bcrypt.hash(refreshToken, 10);

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

        return { accessToken, refreshToken };
      },
    );

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
   * Issue new access token using valid refresh token
   * @security Implement Refresh Token Rotation to prevent reuse attacks
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    // TODO: Verify refresh token signature and expiry
    // const payload = await verifyJWT(refreshToken, env.JWT_REFRESH_SECRET);
    // catch (error) { throw new AppError(401, 'Invalid refresh token') }

    // TODO: Check if refresh token exists in database (not invalidated)
    // const storedToken = await prisma.refreshToken.findUnique({
    //   where: { token: refreshToken },
    //   include: { user: true }
    // });
    // if (!storedToken) {
    //   // SECURITY: Token reuse detected! Possible attack.
    //   // Invalidate ALL tokens for this user as precaution
    //   logger.warn({ userId: payload.userId }, 'Refresh token reuse detected');
    //   throw new AppError(401, 'Invalid refresh token');
    // }

    // TODO: Check if token is expired (expiresAt < now)
    // if (storedToken.expiresAt < new Date()) {
    //   await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    //   throw new AppError(401, 'Refresh token expired');
    // }

    // TODO: Generate NEW access token (short-lived)
    // const newAccessToken = await generateAccessToken(user);

    // TODO: OPTIONAL - Refresh Token Rotation (high security)
    // Generate new refresh token, delete old one
    // This prevents stolen refresh tokens from being reused
    // const newRefreshToken = await generateRefreshToken(user);
    // await prisma.$transaction([
    //   prisma.refreshToken.delete({ where: { id: storedToken.id } }),
    //   prisma.refreshToken.create({ data: { token: newRefreshToken, ... } })
    // ]);

    // TODO: Return new access token (and optionally new refresh token)
    // return { accessToken: newAccessToken, refreshToken: newRefreshToken };

    // TODO: Write test for expired token, reuse detection, rotation
    throw new AppError(501, "Not implemented");
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
  private static async generateAccessToken(user: User): Promise<string> {
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
    user: User,
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

  /**
   * Parse expiry string to milliseconds
   * Supports: 15m, 7d, 1h, etc.
   */
  private static parseExpiry(expiry: string): number {
    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = match[1];
    const unit = match[2];
    const multiplier = units[unit];

    if (!multiplier) {
      throw new Error(`Invalid time unit: ${unit}`);
    }

    return parseInt(value, 10) * multiplier;
  }

  // TODO: Add method for password reset flow
  // static async requestPasswordReset(email: string)
  // static async resetPassword(token: string, newPassword: string)
  // Store reset tokens in database with expiry (15-30 minutes)

  // TODO: Add method for email verification (optional)
  // static async sendVerificationEmail(userId: string)
  // static async verifyEmail(token: string)
}
