import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
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

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Operational errors (AppError) are expected — log at warn level.
  // Only truly unexpected errors get ERROR level to avoid alert fatigue.
  if (err instanceof AppError) {
    logger.warn(
      { statusCode: err.statusCode, message: err.message },
      "Operational error",
    );
  } else {
    logger.error(err);
  }

  // Validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues,
    });
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Resource already exists",
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Resource not found",
      });
    }
  }

  // Custom app errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Unknown errors
  return res.status(500).json({
    error: "Internal server error",
  });
}
