import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createRequire } from "module";
import { logger, LOG_REDACT_PATHS } from "./shared/lib/logger.js";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { cacheClient } from "./shared/lib/cache.js";

// pino-http v10+ work with ESM, but keeping require is safe for compatibility
const require = createRequire(import.meta.url);
const pinoHttp = require("pino-http");

import { env } from "./config/env.js";
import { errorHandler } from "./shared/middlewares/error.handler.js";
import { createApiRouter } from "./api.routes.js";

/**
 * Shared Redis store for all rate limiters.
 * Uses the same ioredis client as the app cache — no extra connection needed.
 * Limiter state is shared across all Node.js instances (production-safe).
 */
const redisStore = (prefix: string) =>
  new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis exposes arbitrary commands via .call(command, ...args)
    sendCommand: (...args: string[]) =>
      (cacheClient as any).call(...args) as Promise<any>,
  });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("api"),
  message: { error: "Too many requests, please try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15m
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("login"),
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("register"),
  message: { error: "Too many accounts created from this IP." },
});

export function createApp(): Application {
  const app = express();
  const apiPrefix = `/api/${env.API_VERSION}`;
  const jsonParser = express.json({ limit: "10kb" });

  // Trust the first proxy (needed for accurate client IP when behind load balancers)
  app.set("trust proxy", 1);

  app.use(helmet());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const hasWildcardOrigin = allowedOrigins.includes("*");
  if (hasWildcardOrigin && allowedOrigins.length > 1) {
    throw new Error("CORS_ORIGIN cannot mix '*' with specific origins.");
  }

  const corsOrigin = hasWildcardOrigin
    ? true
    : allowedOrigins.length === 1
      ? allowedOrigins[0]
      : allowedOrigins;

  app.use(
    cors({
      origin: corsOrigin,
      // Wildcard origin should not be combined with credentialed requests.
      credentials: !hasWildcardOrigin,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        redact: {
          paths: [...LOG_REDACT_PATHS],
          censor: "[REDACTED]",
        },
        autoLogging: {
          ignore: (req: Request) => req.url === "/health",
        },
        customSuccessMessage: (req: Request) =>
          `${req.method} ${req.url} completed`,
        customErrorMessage: (req: Request, _res: Response, err: Error) =>
          `${req.method} ${req.url} failed: ${err.message}`,
      }),
    );
  }

  app.use((req, res, next) => {
    if (req.path === `${apiPrefix}/payments/webhook`) {
      return next();
    }
    return jsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: "25kb" }));

  app.use(apiPrefix, apiLimiter);
  app.use(`${apiPrefix}/auth/register`, registerLimiter);
  app.use(`${apiPrefix}/auth/login`, loginLimiter);

  app.use(apiPrefix, createApiRouter());

  app.use(errorHandler);

  return app;
}
