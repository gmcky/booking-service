import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error.handler.js";
import { AuthService } from "../../modules/auth/auth.service.js";
import { logger } from "../lib/logger.js";

/** Mandatory auth middleware. */
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

    const token = authHeader.slice(7);
    const user = await AuthService.verifyAccessToken(token);

    req.user = user;

    logger.debug(
      { userId: user.id, method: req.method, path: req.path, ip: req.ip },
      "User authenticated",
    );

    next();
  } catch (error) {
    // errorHandler is the single auth-failure log source; avoid duplicate log lines.
    next(error);
  }
}

/** Role gate middleware; requires authenticate() upstream. */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }

    next();
  };
}

/** Best-effort auth for public endpoints. */
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
    } catch (error) {
      // Invalid token downgrades to anonymous context. Header lets the client
      // distinguish "no token sent" from "token sent but rejected".
      res.setHeader("X-Auth-Warning", "token-invalid");
      logger.debug(
        { error, ip: req.ip, method: req.method, path: req.path },
        "optionalAuth: invalid token downgraded to anonymous",
      );
    }
  }

  next();
}
