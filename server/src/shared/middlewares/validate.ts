import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req[target] = await schema.parseAsync(req[target]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
