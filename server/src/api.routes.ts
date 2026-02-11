import { Router } from "express";
import { env } from "./config/env.js";

// Import module routes
import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { propertyRouter } from "./modules/properties/property.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { paymentRouter } from "./modules/payments/payment.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";

/**
 * Main API router
 * Combines all module routes under /api/v1 prefix
 */
export function createApiRouter(): Router {
  const router = Router();
  const apiPrefix = `/api/${env.API_VERSION}`;

  // Health check (outside versioned API)
  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      version: env.API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  // Module routes (versioned)
  router.use(`${apiPrefix}/auth`, authRouter);
  router.use(`${apiPrefix}/users`, userRouter);
  router.use(`${apiPrefix}/properties`, propertyRouter);
  router.use(`${apiPrefix}/bookings`, bookingRouter);
  router.use(`${apiPrefix}/payments`, paymentRouter);
  router.use(`${apiPrefix}/reviews`, reviewRouter);

  // 404 handler for API routes
  router.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
      path: req.path,
      availableRoutes: [
        `${apiPrefix}/auth`,
        `${apiPrefix}/users`,
        `${apiPrefix}/properties`,
        `${apiPrefix}/bookings`,
        `${apiPrefix}/payments`,
        `${apiPrefix}/reviews`,
      ],
    });
  });

  return router;
}
