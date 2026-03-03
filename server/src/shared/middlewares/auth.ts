import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error.handler.js";
import { AuthService } from "../../modules/auth/auth.service.js";
import { logger } from "../lib/logger.js";

/**
 * Extracts and verifies the JWT access token from the Authorization header.
 * Attaches decoded user info to req.user on success.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "No token provided");
    }

    const token = authHeader.slice(7); // "Bearer ".length === 7
    const user = await AuthService.verifyAccessToken(token);

    req.user = user;

    logger.debug(
      { userId: user.id, method: req.method, path: req.path, ip: req.ip },
      "User authenticated",
    );

    next();
  } catch (error) {
    logger.warn(
      {
        method: req.method,
        path: req.path,
        ip: req.ip,
        error: (error as Error).message,
      },
      "Authentication failed",
    );
    next(error);
  }
}

/**
 * Authorization middleware factory — checks that req.user has one of the
 * required roles. Must be placed after authenticate().
 *
 * Usage:
 *   router.post('/properties', authenticate, authorize('OWNER', 'ADMIN'), handler)
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: roles,
          path: req.path,
        },
        "Authorization failed — insufficient permissions",
      );
      return next(new AppError(403, "Insufficient permissions"));
    }

    next();
  };
}

/**
 * Optional authentication — attaches req.user if a valid token is present,
 * but lets the request through regardless. Useful for public endpoints that
 * return enriched data for logged-in users.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  if (token) {
    try {
      req.user = await AuthService.verifyAccessToken(token);
    } catch {
      // Invalid / expired token — continue as unauthenticated
    }
  }

  next();
}
