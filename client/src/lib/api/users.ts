import { apiClient } from "./client";
import { unwrapVoid } from "./unwrap";
import type { paths } from "./schema";

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

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
   */
  updateProfile: async (input: UpdateProfileInput): Promise<void> => {
    const form = new FormData();
    if (input.firstName) form.set("firstName", input.firstName);
    if (input.lastName) form.set("lastName", input.lastName);
    const { error, response } = await apiClient.PATCH("/users/me", {
      body: form as unknown as UpdateProfileBody,
    });
    unwrapVoid({ error, response });
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
