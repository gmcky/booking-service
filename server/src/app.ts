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
import { logger } from "./shared/lib/logger.js";

// pino-http v11 is CommonJS, need to use require
const require = createRequire(import.meta.url);
const pinoHttp = require("pino-http");
import { env } from "./config/env.js";
import { errorHandler } from "./shared/middlewares/error.handler.js";

// Import routes
import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { propertyRouter } from "./modules/properties/property.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { paymentRouter } from "./modules/payments/payment.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";

export function createApp(): Application {
  const app = express();

  // Security & Performance
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // HTTP request logging with pino-http (skip in test)
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: true,
        customLogLevel: (req: Request, res: Response, err?: Error) => {
          if (res.statusCode >= 500 || err) return "error";
          if (res.statusCode >= 400) return "warn";
          if (res.statusCode >= 300) return "info";
          return "info";
        },
        customSuccessMessage: (req: Request, res: Response) => {
          return `${req.method} ${req.url} completed`;
        },
        customErrorMessage: (req: Request, res: Response, err: Error) => {
          return `${req.method} ${req.url} failed: ${err.message}`;
        },
      }),
    );
  }

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes
  const apiPrefix = `/api/${env.API_VERSION}`;
  app.use(`${apiPrefix}/auth`, authRouter);
  app.use(`${apiPrefix}/users`, userRouter);
  app.use(`${apiPrefix}/properties`, propertyRouter);
  app.use(`${apiPrefix}/bookings`, bookingRouter);
  app.use(`${apiPrefix}/payments`, paymentRouter);
  app.use(`${apiPrefix}/reviews`, reviewRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
