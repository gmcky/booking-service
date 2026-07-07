import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components, paths } from "./schema";
import type { Paginated } from "./properties";

export type UserProfile = components["schemas"]["UserProfile"];
export type UserStats = components["schemas"]["UserStats"];
export type PublicUserProfile = components["schemas"]["PublicUserProfile"];
export type HostReview = components["schemas"]["HostReview"];

export interface HostReviewQuery {
  page?: number;
  limit?: number;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  bio?: string;
  avatar?: File;
}

export type UpdateProfileResult =
  | { status: 200; profile: UserProfile }
  | { status: 202; message: string };

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type UpdateProfileBody = paths["/users/me"]["patch"]["requestBody"]["content"]["multipart/form-data"];

export const userApi = {
  /**
   * PATCH /users/me is multipart (optional avatar). openapi-fetch passes a
   * FormData body straight through at runtime (see its defaultBodySerializer),
   * but the generated type only describes the plain-object field shape —
   * cast through that shape so this stays on the typed client (Authorization
   * + refresh-retry middleware still apply) instead of a parallel raw fetch.
   *
   * Returns 200 (synchronous UserProfile) or 202 ({message}, avatar still
   * processing) — caller branches on `status` to decide whether to poll.
   */
  updateProfile: async (input: UpdateProfileInput): Promise<UpdateProfileResult> => {
    const form = new FormData();
    if (input.firstName) form.set("firstName", input.firstName);
    if (input.lastName) form.set("lastName", input.lastName);
    if (input.phoneNumber) form.set("phoneNumber", input.phoneNumber);
    if (input.dateOfBirth) form.set("dateOfBirth", input.dateOfBirth);
    if (input.bio) form.set("bio", input.bio);
    if (input.avatar) form.set("avatar", input.avatar);
    const { data, error, response } = await apiClient.PATCH("/users/me", {
      body: form as unknown as UpdateProfileBody,
    });
    const result = unwrap({ data, error, response });
    if (response.status === 202) {
      return { status: 202, message: (result as { message?: string }).message ?? "" };
    }
    return { status: 200, profile: result as UserProfile };
  },

  publicProfile: async (id: string): Promise<PublicUserProfile> => {
    const { data, error, response } = await apiClient.GET("/users/{id}", {
      params: { path: { id } },
    });
    return unwrap({ data, error, response });
  },

  hostReviews: async (id: string, query: HostReviewQuery = {}): Promise<Paginated<HostReview>> => {
    const { data, error, response } = await apiClient.GET("/users/{id}/reviews", {
      params: { path: { id }, query: { page: query.page, limit: query.limit } },
    });
    return unwrap({ data, error, response });
  },

  getStats: async (): Promise<UserStats> => {
    const { data, error, response } = await apiClient.GET("/users/me/stats");
    return unwrap({ data, error, response });
  },

  deleteAvatar: async (): Promise<void> => {
    const { error, response } = await apiClient.DELETE("/users/me/avatar", {});
    unwrapVoid({ error, response });
  },

  requestEmailChange: async (newEmail: string): Promise<{ message: string }> => {
    const { data, error, response } = await apiClient.POST("/users/me/email/request-change", {
      body: { newEmail },
    });
    return unwrap({ data, error, response });
  },

  confirmEmailChange: async (otp: string): Promise<{ message: string }> => {
    const { data, error, response } = await apiClient.POST("/users/me/email/confirm-change", {
      body: { otp },
    });
    return unwrap({ data, error, response });
  },

  changePassword: async (input: ChangePasswordInput): Promise<void> => {
    const { error, response } = await apiClient.POST("/users/me/change-password", {
      body: input,
    });
    unwrapVoid({ error, response });
  },

  deleteAccount: async (password: string): Promise<void> => {
    const { error, response } = await apiClient.DELETE("/users/me", {
      body: { password },
    });
    unwrapVoid({ error, response });
  },
};
