import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as adminController from "./admin.controller.js";
import {
  hostCancellationsQuerySchema,
  rejectHostCancellationSchema,
  updateSettingsSchema,
} from "./admin.validators.js";

export const adminRouter: IRouter = Router();

// Every admin route requires an authenticated ADMIN.
adminRouter.use(authenticate, authorize("ADMIN"));

/**
 * @openapi
 * /admin/host-cancellations:
 *   get:
 *     tags: [Admin]
 *     summary: List host cancellation requests (oldest first)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, APPROVED, REJECTED, VOIDED] } }
 *     responses:
 *       200:
 *         description: Cancellation request list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/HostCancellationRequestItem' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *               required: [data, pagination]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRouter.get(
  "/host-cancellations",
  validate(hostCancellationsQuerySchema, "query"),
  asyncHandler(adminController.listHostCancellations),
);

/**
 * @openapi
 * /admin/host-cancellations/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve a host cancellation request (cancels booking, full refund)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Request approved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HostCancellationRequest' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
adminRouter.post(
  "/host-cancellations/:id/approve",
  asyncHandler(adminController.approveHostCancellation),
);

/**
 * @openapi
 * /admin/host-cancellations/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject a host cancellation request (booking untouched)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Request rejected
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HostCancellationRequest' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
adminRouter.post(
  "/host-cancellations/:id/reject",
  validate(rejectHostCancellationSchema),
  asyncHandler(adminController.rejectHostCancellation),
);

/**
 * @openapi
 * /admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Read platform settings
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Platform settings
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformSettings' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   patch:
 *     tags: [Admin]
 *     summary: Update platform settings (host-cancel auto-approval policy)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hostCancelAutoApproveEnabled: { type: boolean }
 *               hostCancelAutoApproveDays: { type: integer, minimum: 1, maximum: 90 }
 *     responses:
 *       200:
 *         description: Updated settings
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PlatformSettings' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRouter.get("/settings", asyncHandler(adminController.getSettings));
adminRouter.patch(
  "/settings",
  validate(updateSettingsSchema),
  asyncHandler(adminController.updateSettings),
);
