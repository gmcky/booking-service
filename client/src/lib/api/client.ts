import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { useAuthStore } from "@/lib/auth/store";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export const apiClient = createClient<paths>({
  baseUrl: BASE_URL,
  credentials: "include",
});

let isRefreshing = false;

apiClient.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },

  async onResponse({ response, request }) {
    if (response.status !== 401 || isRefreshing) return response;

    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!refreshRes.ok) {
        useAuthStore.getState().clear();
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
        return response;
      }

      const data = await refreshRes.json() as { accessToken: string };
      useAuthStore.getState().setAuth(data.accessToken, useAuthStore.getState().user!);

      const retryReq = new Request(request, {
        headers: new Headers(request.headers),
      });
      retryReq.headers.set("Authorization", `Bearer ${data.accessToken}`);
      return fetch(retryReq);
    } finally {
      isRefreshing = false;
    }
  },
});

export { BASE_URL };
