import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { RegisterInput, LoginInput, AuthResponse } from "./auth.types.js";
import bcrypt from "bcrypt";
import { SignJWT } from "jose";
import { env } from "../../config/env.js";
import type { User } from "@prisma/client";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

/**
 * AuthService handles all authentication and authorization logic
 * Implements JWT-based auth with Access + Refresh Token strategy
 */
export class AuthService {
  /**
   * Register a new user
   * @security Implement rate limiting on controller level to prevent spam
   */
  static async register(data: RegisterInput): Promise<AuthResponse> {
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
      if (existingUser.email === data.email.toLowerCase()) {
        throw new AppError(409, "User with this email already exists");
      }
      if (existingUser.phoneNumber === data.phoneNumber) {
        throw new AppError(409, "User with this phone number already exists");
      }
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
          },
        });

        return { user, accessToken, refreshToken };
      });

      // Log successful registration (structured logging)
      logger.info(
        { userId: result.user.id, email: result.user.email },
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
      // Catch unique constraint violations (race condition)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          const target = error.meta?.target as string[] | undefined;
          if (target?.includes("email")) {
            throw new AppError(409, "User with this email already exists");
          }
          if (target?.includes("phoneNumber")) {
            throw new AppError(409, "User with this phone number already exists");
          }
          throw new AppError(409, "User already exists");
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
  static async login(data: LoginInput) {
    // TODO: Find user by email (case-insensitive)
    // const user = await prisma.user.findUnique({
    //   where: { email: data.email.toLowerCase() }
    // });
    // if (!user) throw new AppError(401, 'Invalid credentials');
    // SECURITY: Use generic message to prevent email enumeration

    // TODO: Verify password using bcrypt.compare()
    // const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    // if (!isValidPassword) {
    //   // TODO: Increment failed login counter (prevent brute force)
    //   throw new AppError(401, 'Invalid credentials');
    // }

    // TODO: Generate new Access + Refresh tokens
    // Access Token payload: { userId, email, role, iat, exp }
    // Refresh Token payload: { userId, tokenId (UUID), iat, exp }

    // TODO: Store Refresh Token in database
    // Implement token rotation: delete old tokens for this user (optional)
    // or keep max N tokens per user to support multiple devices

    // TODO: Log successful login with IP and User-Agent
    // logger.info({ userId: user.id, ip: req.ip }, 'User logged in');

    // TODO: Return tokens and safe user data (exclude passwordHash!)
    // return { user: omit(user, 'passwordHash'), accessToken, refreshToken };

    // TODO: Write test for invalid credentials, account lockout
    throw new AppError(501, "Not implemented");
  }

  /**
   * Logout user by invalidating refresh token
   */
  static async logout(refreshToken: string) {
    // TODO: Verify the refresh token signature first
    // const payload = await verifyJWT(refreshToken, env.JWT_REFRESH_SECRET);

    // TODO: Delete refresh token from database
    // await prisma.refreshToken.delete({
    //   where: { token: refreshToken }
    // });
    // Handle error gracefully if token doesn't exist (already logged out)

    // TODO: Optional: Add token to Redis blacklist until expiry
    // This prevents using the token even if stolen before deletion
    // await redis.setex(`blacklist:${tokenId}`, ttl, '1');

    // TODO: Log logout event
    // logger.info({ userId: payload.userId }, 'User logged out');

    throw new AppError(501, "Not implemented");
  }

  /**
   * Issue new access token using valid refresh token
   * @security Implement Refresh Token Rotation to prevent reuse attacks
   */
  static async refreshToken(refreshToken: string) {
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
  static async verifyAccessToken(token: string) {
    // TODO: Verify JWT signature using jose library
    // import { jwtVerify } from 'jose';
    // const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    // const { payload } = await jwtVerify(token, secret);
    // if (!payload.userId) throw new AppError(401, 'Invalid token');

    // TODO: Optional - Check if user still exists and is active
    // const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    // if (!user) throw new AppError(401, 'User not found');

    // TODO: Optional - Check token blacklist in Redis (for immediate logout)

    // TODO: Return decoded payload { userId, email, role }
    // This will be attached to req.user by the middleware

    throw new AppError(501, "Not implemented");
  }

  /**
   * Generate Access Token (short-lived)
   */
  private static async generateAccessToken(user: User): Promise<string> {
    const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

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
      .sign(secret);

    return token;
  }

  /**
   * Generate Refresh Token (long-lived)
   */
  private static async generateRefreshToken(user: User, jti: string): Promise<string> {
    const secret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

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
      .sign(secret);

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
