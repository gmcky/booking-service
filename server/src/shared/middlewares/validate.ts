import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

type ValidationTarget = "body" | "query" | "params";
type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req[target]);
      const current = req[target];

      // Express 5 exposes req.query through a getter-only property.
      // To keep transformed values (coercion/defaults), mutate in place.
      if (isPlainObject(current) && isPlainObject(parsed)) {
        for (const key of Object.keys(current)) {
          delete current[key];
        }
        Object.assign(current, parsed);
      } else {
        (req as Record<ValidationTarget, unknown>)[target] = parsed;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
