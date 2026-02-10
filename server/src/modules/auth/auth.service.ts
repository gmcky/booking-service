import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { RegisterInput, LoginInput } from "./auth.types.js";

/**
 * AuthService handles all authentication and authorization logic
 * Implements JWT-based auth with Access + Refresh Token strategy
 */
export class AuthService {
  /**
   * Register a new user
   * @security Implement rate limiting on controller level to prevent spam
   */
  static async register(data: RegisterInput) {
    // TODO: Check if user already exists (email unique constraint)
    // const existingUser = await prisma.user.findUnique({ where: { email } });
    // if (existingUser) throw new AppError(409, "User already exists");

    // TODO: Hash password using bcrypt with salt rounds = 12
    // import bcrypt from 'bcrypt';
    // const passwordHash = await bcrypt.hash(data.password, 12);
    // CRITICAL: Never store plain text passwords!

    // TODO: Create user in database
    // const user = await prisma.user.create({
    //   data: { email, passwordHash, firstName, lastName, role: 'USER' }
    // });

    // TODO: Generate JWT tokens (Access + Refresh)
    // - Access Token: Short-lived (15m), contains user.id, role
    // - Refresh Token: Long-lived (7d), stored in DB for invalidation
    // Use 'jose' library for JWT (already installed)

    // TODO: Store Refresh Token in database with expiry
    // await prisma.refreshToken.create({
    //   data: { token: refreshToken, userId: user.id, expiresAt }
    // });

    // TODO: Log successful registration (structured logging)
    // logger.info({ userId: user.id, email: user.email }, 'User registered');

    // TODO: Return { user: {...}, accessToken, refreshToken }
    // IMPORTANT: Controller should set refreshToken as HttpOnly cookie

    // TODO: Write unit test for duplicate email registration
    throw new AppError(501, "Not implemented");
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

  // TODO: Add helper methods for token generation
  // private static async generateAccessToken(user: User): Promise<string>
  // private static async generateRefreshToken(user: User): Promise<string>
  // Use env.JWT_ACCESS_EXPIRES_IN and env.JWT_REFRESH_EXPIRES_IN

  // TODO: Add method for password reset flow
  // static async requestPasswordReset(email: string)
  // static async resetPassword(token: string, newPassword: string)
  // Store reset tokens in database with expiry (15-30 minutes)

  // TODO: Add method for email verification (optional)
  // static async sendVerificationEmail(userId: string)
  // static async verifyEmail(token: string)
}
