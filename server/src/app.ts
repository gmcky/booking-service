import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createRequire } from "module";
import { logger, LOG_REDACT_PATHS } from "./shared/lib/logger.js";
import rateLimit from "express-rate-limit";
import { RedisStore, type SendCommandFn } from "rate-limit-redis";
import { cacheClient } from "./shared/lib/cache.js";
import * as Sentry from "@sentry/node";

// pino-http v10+ work with ESM, but keeping require is safe for compatibility
const require = createRequire(import.meta.url);
const pinoHttp = require("pino-http");

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { errorHandler } from "./shared/middlewares/error.handler.js";
import { traceMiddleware } from "./shared/middlewares/trace.js";
import { createApiRouter } from "./api.routes.js";
import { swaggerOptions } from "./config/swagger.js";

/**
 * Shared Redis store for all rate limiters.
 * Uses the same ioredis client as the app cache — no extra connection needed.
 * Limiter state is shared across all Node.js instances (production-safe).
 */
const redisStore = (prefix: string) =>
  new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis exposes arbitrary commands via .call(command, ...args)
    sendCommand: ((...args: string[]) =>
      cacheClient.call(args[0]!, ...args.slice(1))) as SendCommandFn,
  });

// Read ceiling. Generous by design: map browse legitimately fires two
// requests per pan (list + markers), so an active session easily passes a
// few hundred reads per window. Abuse-sensitive paths have their own much
// stricter limiters below.
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
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

/**
 * Caps write traffic on resource modules (properties, bookings, reviews).
 * The global apiLimiter (100/15m) covers reads, but a single IP creating
 * 20 properties/hour is more than any real user; this keeps the demo DB
 * from getting flooded between the daily cleanup runs.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("write"),
  message: { error: "Too many write requests. Please try again later." },
});

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const writeMethodLimiter: express.RequestHandler = (req, res, next) => {
  if (!writeMethods.has(req.method)) return next();
  return writeLimiter(req, res, next);
};

export function createApp(): Application {
  const app = express();
  const apiPrefix = `/api/${env.API_VERSION}`;
  const jsonParser = express.json({ limit: "10kb" });

  // Trust the first proxy (needed for accurate client IP when behind load balancers)
  app.set("trust proxy", 1);

  app.use(traceMiddleware);
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
        customSuccessMessage: (req: Request) => `${req.method} ${req.url} completed`,
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

  // Stripe webhooks retry aggressively on incidents; exempting them from
  // the IP-bucketed apiLimiter avoids dropping events during a backlog.
  app.use(apiPrefix, (req, res, next) => {
    if (req.path === "/payments/webhook") return next();
    return apiLimiter(req, res, next);
  });
  app.use(`${apiPrefix}/auth/register`, registerLimiter);
  app.use(`${apiPrefix}/auth/login`, loginLimiter);
  app.use(`${apiPrefix}/properties`, writeMethodLimiter);
  app.use(`${apiPrefix}/bookings`, writeMethodLimiter);
  app.use(`${apiPrefix}/reviews`, writeMethodLimiter);

  const specs = swaggerJsdoc(swaggerOptions);
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

  app.use(apiPrefix, createApiRouter());

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
