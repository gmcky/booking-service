"use client";

import { useEffect } from "react";
import { useAuthStore } from "./store";
import { endpoints } from "@/lib/api/endpoints";

export function useSession() {
  const { status, setAuth, setStatus } = useAuthStore();

  useEffect(() => {
    if (status !== "idle") return;

    setStatus("loading");

    endpoints
      .refresh()
      .then(async (result) => {
        if (!result) {
          setStatus("anon");
          return;
        }
        const user = await endpoints.me(result.accessToken);
        setAuth(result.accessToken, user);
      })
      .catch(() => setStatus("anon"));
  }, [status, setAuth, setStatus]);

  return { status };
}
