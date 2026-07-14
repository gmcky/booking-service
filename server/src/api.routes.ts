import { Router } from "express";
import { env } from "./config/env.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { propertyRouter } from "./modules/properties/property.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { paymentRouter } from "./modules/payments/payment.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { favoriteRouter } from "./modules/favorites/favorite.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";

/**
 * Main API router factory.
 */
export function createApiRouter(): Router {
  const router = Router();

  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      version: env.API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  router.use("/auth", authRouter);
  router.use("/users", userRouter);
  router.use("/properties", propertyRouter);
  router.use("/bookings", bookingRouter);
  router.use("/payments", paymentRouter);
  router.use("/reviews", reviewRouter);
  router.use("/favorites", favoriteRouter);
  router.use("/admin", adminRouter);

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
        "/favorites",
        "/admin",
      ].map((r) => `/api/${env.API_VERSION}${r}`),
    });
  });

  return router;
}
