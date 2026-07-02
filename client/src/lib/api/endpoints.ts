import { BASE_URL } from "./client";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";
import type { LoginInput, RegisterInput } from "@/lib/auth/schemas";

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json as { message?: string }).message ?? "Request failed");
  }
  return json as T;
}

export const endpoints = {
  login: (data: LoginInput) => post<AuthResponse>("/auth/login", data),

  register: (data: RegisterInput) => post<AuthResponse>("/auth/register", data),

  logout: async () => {
    const token = useAuthStore.getState().accessToken;
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  refresh: async (): Promise<AuthResponse | null> => {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json() as Promise<AuthResponse>;
  },

  me: async (token: string): Promise<AuthUser> => {
    const res = await fetch(`${BASE_URL}/users/me`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Unauthorized");
    return res.json() as Promise<AuthUser>;
  },
};
