import pino from "pino";
import { env } from "../../config/env.js";
import { getRequestId } from "./context.js";

export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.confirmPassword",
  "err.body",
] as const;

const transport = env.LOG_PRETTY_PRINT
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    }
  : undefined;

const mixin = () => {
  const requestId = getRequestId();
  return requestId ? { requestId } : {};
};

export const logger = pino(
  transport
    ? {
        level: env.LOG_LEVEL || "info",
        transport,
        mixin,
        redact: { paths: [...LOG_REDACT_PATHS], censor: "[REDACTED]" },
      }
    : {
        level: env.LOG_LEVEL || "info",
        mixin,
        redact: { paths: [...LOG_REDACT_PATHS], censor: "[REDACTED]" },
      },
);
