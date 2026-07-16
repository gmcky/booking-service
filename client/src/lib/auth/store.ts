"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
  emailVerified: boolean;
}

type AuthStatus = "idle" | "loading" | "authed" | "anon";

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  setStatus: (status: AuthStatus) => void;
  /** Flips the current user's flag once the verify-email landing page
   *  confirms a token, so the banner disappears without a reload. No-op
   *  when signed out (anon verifying doesn't touch the store). */
  markEmailVerified: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  setAuth: (accessToken, user) => set({ accessToken, user, status: "authed" }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null, user: null, status: "anon" }),
  setStatus: (status) => set({ status }),
  markEmailVerified: () =>
    set((state) => (state.user ? { user: { ...state.user, emailVerified: true } } : {})),
}));
