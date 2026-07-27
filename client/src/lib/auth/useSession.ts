"use client";

import { useEffect } from "react";
import { useAuthStore } from "./store";
import { endpoints } from "@/lib/api/endpoints";
import { refreshSession } from "@/lib/api/client";

export function useSession() {
  const { status, setAuth, setStatus } = useAuthStore();

  useEffect(() => {
    if (status !== "idle") return;

    setStatus("loading");

    // Through the shared single-flight, never a refresh of its own: a
    // protected query on the same page can hit a 401 and start one too, and
    // two refreshes race the token rotation into a reuse alarm that revokes
    // every session the visitor has.
    refreshSession()
      .then(async (accessToken) => {
        if (!accessToken) {
          setStatus("anon");
          return;
        }
        const user = await endpoints.me();
        setAuth(accessToken, user);
      })
      .catch(() => setStatus("anon"));
  }, [status, setAuth, setStatus]);

  return { status };
}
