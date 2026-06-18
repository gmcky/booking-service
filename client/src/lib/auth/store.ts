"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
}

type AuthStatus = "idle" | "loading" | "authed" | "anon";

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  setAuth: (accessToken: string, user: AuthUser) => void;
  clear: () => void;
  setStatus: (status: AuthStatus) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  setAuth: (accessToken, user) => set({ accessToken, user, status: "authed" }),
  clear: () => set({ accessToken: null, user: null, status: "anon" }),
  setStatus: (status) => set({ status }),
}));
