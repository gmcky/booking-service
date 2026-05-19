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
 * Mounted under /api/v1 in app.ts — all paths here are relative to that prefix.
 */
export function createApiRouter(): Router {
  const router = Router();

  // Health check
  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      version: env.API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  // Module routes — OpenAPI tags declared per-operation in each module's *.routes.ts
  router.use("/auth", authRouter);
  router.use("/users", userRouter);
  router.use("/properties", propertyRouter);
  router.use("/bookings", bookingRouter);
  router.use("/payments", paymentRouter);
  router.use("/reviews", reviewRouter);

  // 404 handler for unmatched API routes
  router.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
      path: req.path,
      availableRoutes: [
        "/auth",
        "/users",
        "/properties",
        "/bookings",
        "/payments",
        "/reviews",
      ].map((r) => `/api/${env.API_VERSION}${r}`),
    });
  });

  return router;
}
