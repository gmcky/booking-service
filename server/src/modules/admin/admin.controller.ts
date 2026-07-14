import type { Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { HostCancellationService } from "../bookings/host-cancel.service.js";
import { PlatformSettingsService } from "../../shared/lib/platform-settings.service.js";
import type { HostCancellationsQueryInput } from "./admin.validators.js";

/**
 * @route GET /api/v1/admin/host-cancellations
 * @access Admin
 */
export async function listHostCancellations(req: AuthenticatedRequest, res: Response) {
  const { page, limit, status } = req.query as unknown as HostCancellationsQueryInput;
  const result = await HostCancellationService.listRequests({ page, limit }, { status });
  res.json(result);
}

/**
 * @route POST /api/v1/admin/host-cancellations/:id/approve
 * @access Admin
 */
export async function approveHostCancellation(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const result = await HostCancellationService.approve(id, adminId);
  res.json(result);
}

/**
 * @route POST /api/v1/admin/host-cancellations/:id/reject
 * @access Admin
 */
export async function rejectHostCancellation(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const result = await HostCancellationService.reject(id, adminId, req.body.reason);
  res.json(result);
}

/**
 * @route GET /api/v1/admin/settings
 * @access Admin
 */
export async function getSettings(_req: AuthenticatedRequest, res: Response) {
  res.json(await PlatformSettingsService.get());
}

/**
 * @route PATCH /api/v1/admin/settings
 * @access Admin
 */
export async function updateSettings(req: AuthenticatedRequest, res: Response) {
  const adminId = req.user!.id;
  const result = await PlatformSettingsService.update(req.body, adminId);
  res.json(result);
}
