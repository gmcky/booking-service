import { apiClient } from "./client";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";
import type { LoginInput, RegisterInput } from "@/lib/auth/schemas";
import { unwrap } from "./unwrap";

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

/**
 * /auth/login and /auth/register return a user without avatarUrl (fresh
 * sessions never have one yet). Normalize to the store's AuthUser shape.
 */
function toAuthUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "USER" | "ADMIN";
}): AuthUser {
  return { ...user, avatarUrl: null };
}

/**
 * RegisterInput collects a single "name" field, but the backend wants
 * firstName/lastName separately. Split on the first space; single-word
 * names reuse the same word for both (backend requires non-empty lastName).
 */
function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || trimmed.slice(0, spaceIndex),
  };
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
    const { firstName, lastName } = splitName(input.name);
    const { data, error, response } = await apiClient.POST("/auth/register", {
      body: { email: input.email, password: input.password, firstName, lastName },
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
};
