import { BASE_URL } from "./client";
import { useAuthStore } from "@/lib/auth/store";

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(json.message ?? "Request failed");
}

export const userApi = {
  /** PATCH /users/me is multipart (optional avatar); send text fields as FormData. */
  updateProfile: async (input: UpdateProfileInput) => {
    const form = new FormData();
    if (input.firstName) form.set("firstName", input.firstName);
    if (input.lastName) form.set("lastName", input.lastName);
    const res = await fetch(`${BASE_URL}/users/me`, {
      method: "PATCH",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    await ensureOk(res);
  },

  changePassword: async (input: ChangePasswordInput) => {
    const res = await fetch(`${BASE_URL}/users/me/change-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    });
    await ensureOk(res);
  },

  deleteAccount: async (password: string) => {
    const res = await fetch(`${BASE_URL}/users/me`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ password }),
    });
    await ensureOk(res);
  },
};
