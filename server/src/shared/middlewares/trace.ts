import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { requestContext } from "../lib/context.js";

export function traceMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();

  // Ensure the response also has the requestId for client-side correlation.
  res.setHeader("x-request-id", requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
}
