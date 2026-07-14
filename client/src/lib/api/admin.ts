import { apiClient } from "./client";
import { unwrap } from "./unwrap";
import type { components } from "./schema";
import type { Paginated } from "./properties";

export type HostCancellationStatus = components["schemas"]["HostCancellationStatus"];
export type HostCancellationRequestItem = components["schemas"]["HostCancellationRequestItem"];
export type HostCancellationRequest = components["schemas"]["HostCancellationRequest"];
export type PlatformSettings = components["schemas"]["PlatformSettings"];

export interface HostCancellationsQuery {
  page?: number;
  limit?: number;
  status?: HostCancellationStatus;
}

export interface PlatformSettingsUpdate {
  hostCancelAutoApproveEnabled?: boolean;
  hostCancelAutoApproveDays?: number;
}

export const adminApi = {
  hostCancellations: async (
    query: HostCancellationsQuery = {},
  ): Promise<Paginated<HostCancellationRequestItem>> => {
    const { data, error, response } = await apiClient.GET("/admin/host-cancellations", {
      params: { query: { page: query.page, limit: query.limit, status: query.status } },
    });
    return unwrap({ data, error, response });
  },

  approveHostCancellation: async (id: string): Promise<HostCancellationRequest> => {
    const { data, error, response } = await apiClient.POST(
      "/admin/host-cancellations/{id}/approve",
      { params: { path: { id } } },
    );
    return unwrap({ data, error, response });
  },

  rejectHostCancellation: async (id: string, reason?: string): Promise<HostCancellationRequest> => {
    const { data, error, response } = await apiClient.POST(
      "/admin/host-cancellations/{id}/reject",
      { params: { path: { id } }, body: reason ? { reason } : {} },
    );
    return unwrap({ data, error, response });
  },

  getSettings: async (): Promise<PlatformSettings> => {
    const { data, error, response } = await apiClient.GET("/admin/settings");
    return unwrap({ data, error, response });
  },

  updateSettings: async (update: PlatformSettingsUpdate): Promise<PlatformSettings> => {
    const { data, error, response } = await apiClient.PATCH("/admin/settings", { body: update });
    return unwrap({ data, error, response });
  },
};
