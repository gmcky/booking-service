import type { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { MulterError } from "multer";
import { ZodError } from "zod";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues }, "Validation error");
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues,
    });
  }

  if (err instanceof MulterError) {
    logger.warn({ code: err.code }, "Multer error");
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File is too large. Maximum size is 2MB." : err.message;
    return res.status(400).json({ error: message });
  }

  if (err instanceof PrismaClientKnownRequestError) {
    logger.warn({ code: err.code }, "Prisma known request error");
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Resource already exists" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Resource not found" });
    }
  }

  if (err instanceof AppError) {
    logger.warn({ statusCode: err.statusCode, message: err.message }, "Operational error");
    return res.status(err.statusCode).json({ error: err.message });
  }

  Sentry.captureException(err);
  logger.error(err, "Unhandled error");
  return res.status(500).json({ error: "Internal server error" });
}
