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

/**
 * Thrown by unwrap/unwrapVoid on any failed request. `.message` behaves
 * exactly like a plain Error (existing `err.message` / `err instanceof Error`
 * catch sites are unaffected); `.code` additionally surfaces the backend's
 * `AppError.code` when present (e.g. "EMAIL_NOT_VERIFIED") so callers that
 * care can branch on it without string-matching the message.
 */
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function extractMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "details" in error) {
    const details = (error as { details?: unknown }).details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { message?: unknown };
      if (first && typeof first.message === "string" && first.message.length > 0) {
        return first.message;
      }
    }
  }
  if (error && typeof error === "object" && "error" in error) {
    const value = (error as { error?: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function extractCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function unwrap<T>({ data, error, response }: UnwrapArgs<T>): T {
  if (error !== undefined) {
    throw new ApiError(
      extractMessage(error) ?? `Request failed (${response.status})`,
      extractCode(error),
    );
  }
  if (data === undefined) {
    throw new ApiError(`Request failed (${response.status})`);
  }
  return data;
}

/** For endpoints with no response body (204, or 200 with no content) on success. */
export function unwrapVoid(args: { error?: unknown; response: Response }): void {
  if (args.error !== undefined || !args.response.ok) {
    throw new ApiError(
      extractMessage(args.error) ?? `Request failed (${args.response.status})`,
      extractCode(args.error),
    );
  }
}
