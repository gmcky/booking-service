import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req[target]);

      // Express 5 exposes req.query as a prototype getter that re-parses the
      // query string on every access, so mutating the returned object is lost.
      // Shadow it with an own property holding the parsed value.
      Object.defineProperty(req, target, {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
