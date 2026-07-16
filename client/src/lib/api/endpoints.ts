import { apiClient } from "./client";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";
import type { LoginInput, RegisterInput } from "@/lib/auth/schemas";
import { unwrap, unwrapVoid } from "./unwrap";

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

/**
 * /auth/login and /auth/register return the full AuthUser (existing users can
 * already have an avatar). Normalize to the store's AuthUser shape.
 */
function toAuthUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
  emailVerified: boolean;
}): AuthUser {
  return { ...user };
}

export const endpoints = {
  login: async (input: LoginInput): Promise<AuthResult> => {
    const { data, error, response } = await apiClient.POST("/auth/login", {
      body: input,
      credentials: "include",
    });
    const result = unwrap({ data, error, response });
    return { accessToken: result.accessToken, user: toAuthUser(result.user) };
  },

  register: async (input: RegisterInput): Promise<AuthResult> => {
    const { data, error, response } = await apiClient.POST("/auth/register", {
      body: input,
      credentials: "include",
    });
    const result = unwrap({ data, error, response });
    return { accessToken: result.accessToken, user: toAuthUser(result.user) };
  },

  logout: async (): Promise<void> => {
    // Best-effort: refresh cookie is cleared server-side regardless of outcome.
    await apiClient.POST("/auth/logout", { credentials: "include" });
  },

  refresh: async (): Promise<{ accessToken: string } | null> => {
    const { data, error } = await apiClient.POST("/auth/refresh", {
      credentials: "include",
    });
    if (error || !data) return null;
    // Prime the store so the middleware attaches Authorization on the
    // immediately-following /users/me call.
    useAuthStore.getState().setAccessToken(data.accessToken);
    return data;
  },

  me: async (): Promise<AuthUser> => {
    const { data, error, response } = await apiClient.GET("/users/me", {
      credentials: "include",
    });
    return unwrap({ data, error, response });
  },

  verifyEmail: async (token: string): Promise<void> => {
    const { error, response } = await apiClient.POST("/auth/verify-email", {
      body: { token },
    });
    unwrapVoid({ error, response });
  },

  resendVerification: async (): Promise<void> => {
    const { error, response } = await apiClient.POST("/auth/resend-verification");
    unwrapVoid({ error, response });
  },
};
