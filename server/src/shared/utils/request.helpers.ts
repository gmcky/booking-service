import type { Request } from "express";
import { AppError } from "../middlewares/error.handler.js";

export function getIdParam(req: Request, paramName: string = "id"): string {
  const id = req.params[paramName];

  if (!id || Array.isArray(id)) {
    throw new AppError(400, `Invalid ${paramName} parameter`);
  }

  return id;
}

export function getQueryParam(
  req: Request,
  paramName: string,
): string | undefined {
  const value = req.query[paramName];

  // Handle array - return first element
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }

  // Handle ParsedQs object (complex nested query params)
  // For simple use cases, we only accept string values
  if (typeof value === "string") {
    return value;
  }

  // Return undefined for ParsedQs objects or undefined
  return undefined;
}
