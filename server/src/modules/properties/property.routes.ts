import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as propertyController from "./property.controller.js";
import {
  createPropertySchema,
  updatePropertySchema,
  propertyQuerySchema,
} from "./property.validators.js";

export const propertyRouter: IRouter = Router();

// Public routes
propertyRouter.get(
  "/",
  validate(propertyQuerySchema, "query"),
  asyncHandler(propertyController.getProperties),
);

propertyRouter.get("/:id", asyncHandler(propertyController.getPropertyById));

// Protected routes - Owner only
propertyRouter.use(authenticate);
propertyRouter.use(authorize("OWNER", "ADMIN"));

propertyRouter.post(
  "/",
  validate(createPropertySchema),
  asyncHandler(propertyController.createProperty),
);

propertyRouter.patch(
  "/:id",
  validate(updatePropertySchema),
  asyncHandler(propertyController.updateProperty),
);

propertyRouter.delete("/:id", asyncHandler(propertyController.deleteProperty));

propertyRouter.post(
  "/:id/activate",
  asyncHandler(propertyController.activateProperty),
);

propertyRouter.post(
  "/:id/deactivate",
  asyncHandler(propertyController.deactivateProperty),
);
