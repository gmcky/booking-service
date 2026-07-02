import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { useAuthStore } from "@/lib/auth/store";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/**
 * Refresh cookie is httpOnly and path-scoped to /api/v1/auth, so only auth
 * routes need credentials. Non-auth routes authenticate via Bearer header.
 */
export const apiClient = createClient<paths>({
  baseUrl: BASE_URL,
});

/**
 * Single-flight refresh: concurrent 401s share one in-flight refresh request
 * and retry once it settles. Resolves to the new access token, or null when
 * the session is gone.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string };
    useAuthStore.getState().setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

function isAuthRoute(request: Request): boolean {
  return new URL(request.url).pathname.includes("/auth/");
}

/**
 * A sent Request's body is consumed, so it cannot be re-constructed for a
 * retry. Keep a pre-send clone to replay after a successful refresh.
 */
const retryClones = new WeakMap<Request, Request>();

apiClient.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    if (!isAuthRoute(request)) {
      retryClones.set(request, request.clone());
    }
    return request;
  },

  async onResponse({ response, request }) {
    // 401 from an auth route means bad credentials, not an expired session.
    if (response.status !== 401 || isAuthRoute(request)) return response;

    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const token = await refreshPromise;

    if (!token) {
      useAuthStore.getState().clear();
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
      return response;
    }

    const retryReq = retryClones.get(request);
    if (!retryReq) return response;
    retryReq.headers.set("Authorization", `Bearer ${token}`);
    return fetch(retryReq);
  },
});

export { BASE_URL };
