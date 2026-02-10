import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error.handler.js";
// import { AuthService } from "../../modules/auth/auth.service.js";
// import { logger } from "../lib/logger.js";

/**
 * Authentication Middleware
 * Extracts and verifies JWT access token from Authorization header
 * Attaches decoded user info to req.user
 *
 * CRITICAL SECURITY REQUIREMENTS:
 * 1. Always verify token signature with secret key
 * 2. Check token expiration (reject expired tokens)
 * 3. Validate token structure and required claims
 * 4. Optional: Check token blacklist (for immediate logout)
 * 5. Handle all JWT errors gracefully (expired, invalid, malformed)
 */

// TODO: Implement JWT verification using 'jose' library
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // TODO: Extract token from Authorization header
    // Format: "Bearer <token>"
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   throw new AppError(401, 'No token provided');
    // }
    // const token = authHeader.replace('Bearer ', '');

    // TODO: Verify JWT signature and expiration
    // Using 'jose' library (modern, secure, supports EdDSA)
    // import { jwtVerify } from 'jose';
    // import { env } from '../../config/env.js';
    //
    // const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    // try {
    //   const { payload } = await jwtVerify(token, secret, {
    //     algorithms: ['HS256'],
    //     issuer: 'booking-service',
    //     audience: 'booking-api'
    //   });
    //
    //   // Validate required claims
    //   if (!payload.userId || !payload.email || !payload.role) {
    //     throw new AppError(401, 'Invalid token structure');
    //   }
    //
    //   // Attach user info to request (type-safe)
    //   req.user = {
    //     id: payload.userId as string,
    //     email: payload.email as string,
    //     role: payload.role as 'USER' | 'HOST' | 'ADMIN'
    //   };
    //
    // } catch (error) {
    //   if (error.code === 'ERR_JWT_EXPIRED') {
    //     throw new AppError(401, 'Token expired');
    //   }
    //   throw new AppError(401, 'Invalid token');
    // }

    // TODO: OPTIONAL - Check if token is blacklisted (for immediate logout)
    // import { redis } from '../lib/redis.js';
    // const isBlacklisted = await redis.get(`blacklist:${payload.jti}`);
    // if (isBlacklisted) {
    //   throw new AppError(401, 'Token has been revoked');
    // }

    // TODO: OPTIONAL - Check if user still exists and is active
    // Prevents deleted/banned users from accessing API
    // import { prisma } from '../lib/prisma.js';
    // const user = await prisma.user.findUnique({
    //   where: { id: req.user.id },
    //   select: { id: true, isActive: true }
    // });
    // if (!user || !user.isActive) {
    //   throw new AppError(401, 'User account not active');
    // }

    // TODO: Log authentication for security auditing
    // logger.debug({
    //   userId: req.user.id,
    //   endpoint: req.path,
    //   method: req.method,
    //   ip: req.ip
    // }, 'User authenticated');

    next();
  } catch (error) {
    // TODO: Log failed authentication attempts (security monitoring)
    // logger.warn({
    //   endpoint: req.path,
    //   ip: req.ip,
    //   error: error.message
    // }, 'Authentication failed');

    next(error);
  }
}

/**
 * Authorization Middleware Factory
 * Checks if authenticated user has required role(s)
 * Must be used AFTER authenticate() middleware
 *
 * Usage:
 * router.post('/properties', authenticate, authorize('HOST', 'ADMIN'), createProperty)
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // TODO: Implement role-based access control (RBAC)
    // Prerequisites: req.user must be set by authenticate middleware
    //
    // if (!req.user) {
    //   // This should never happen if authenticate() runs first
    //   throw new AppError(401, 'Authentication required');
    // }
    //
    // if (!roles.includes(req.user.role)) {
    //   logger.warn({
    //     userId: req.user.id,
    //     userRole: req.user.role,
    //     requiredRoles: roles,
    //     endpoint: req.path
    //   }, 'Authorization failed - insufficient permissions');
    //
    //   throw new AppError(403, 'Insufficient permissions');
    // }
    //
    // logger.debug({
    //   userId: req.user.id,
    //   role: req.user.role,
    //   endpoint: req.path
    // }, 'User authorized');

    next();
  };
}

// TODO: Add middleware for optional authentication
// Some endpoints are public but show extra data if user is logged in
// export function optionalAuth(req: Request, res: Response, next: NextFunction) {
//   try {
//     const token = req.headers.authorization?.replace('Bearer ', '');
//     if (token) {
//       // Verify token, but don't throw error if invalid
//       const payload = await verifyJWT(token);
//       req.user = payload;
//     }
//   } catch {
//     // Silently fail, request continues as unauthenticated
//   }
//   next();
// }

// TODO: Add rate limiting per user (not just per IP)
// export function userRateLimit(maxRequests: number, windowMs: number) {
//   return async (req: Request, res: Response, next: NextFunction) => {
//     if (!req.user) return next();
//
//     const key = `rate:${req.user.id}:${req.path}`;
//     const requests = await redis.incr(key);
//     if (requests === 1) {
//       await redis.expire(key, windowMs / 1000);
//     }
//
//     if (requests > maxRequests) {
//       throw new AppError(429, 'Too many requests');
//     }
//
//     next();
//   };
// }

// TODO: Write tests for authentication/authorization
// Test cases:
// - Valid token -> success
// - Expired token -> 401
// - Invalid signature -> 401
// - Malformed token -> 401
// - No token -> 401
// - Valid token but wrong role -> 403
// - Blacklisted token -> 401
// - Deleted user -> 401
