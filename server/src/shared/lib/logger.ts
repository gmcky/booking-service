import pino from "pino";
import { env } from "../../config/env.js";

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
    ? { level: env.LOG_LEVEL || "info", transport }
    : { level: env.LOG_LEVEL || "info" },
);
