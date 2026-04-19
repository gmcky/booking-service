import pino from "pino";
import { env } from "../../config/env.js";

export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.confirmPassword",
  "err.body",
] as const;

const transport =
  env.NODE_ENV === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined;

export const logger = pino(
  transport
    ? {
        level: env.LOG_LEVEL || "info",
        transport,
        redact: { paths: [...LOG_REDACT_PATHS], censor: "[REDACTED]" },
      }
    : {
        level: env.LOG_LEVEL || "info",
        redact: { paths: [...LOG_REDACT_PATHS], censor: "[REDACTED]" },
      },
);
