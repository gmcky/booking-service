/**
 * Shared response unwrapper for openapi-fetch calls. Backend error bodies
 * always match components["schemas"]["Error"] = { error: string; details?: ... }
 * (see server/src/shared/middlewares/error.handler.ts). Throws an Error whose
 * `.message` is the backend message so callers (forms, toasts) can read
 * `err.message` directly.
 */
export interface UnwrapArgs<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function extractMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "error" in error) {
    const value = (error as { error?: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function unwrap<T>({ data, error, response }: UnwrapArgs<T>): T {
  if (error !== undefined) {
    throw new Error(extractMessage(error) ?? `Request failed (${response.status})`);
  }
  if (data === undefined) {
    throw new Error(`Request failed (${response.status})`);
  }
  return data;
}

/** For endpoints with no response body (204, or 200 with no content) on success. */
export function unwrapVoid(args: { error?: unknown; response: Response }): void {
  if (args.error !== undefined || !args.response.ok) {
    throw new Error(extractMessage(args.error) ?? `Request failed (${args.response.status})`);
  }
}
