import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { useAuthStore } from "@/lib/auth/store";
import { BASE_URL } from "./base-url";

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

/**
 * The only way anything in the app may refresh a session.
 *
 * Refresh tokens rotate, and a second request carrying the token the first one
 * just replaced reads as reuse — the server revokes every session for that
 * user, which is exactly what it should do to a stolen token. Two refreshes of
 * our own therefore log the visitor out of their own account. That is what
 * happened when a cold page load restored the session while a protected query
 * on the same page hit a 401 and started its own refresh: it cost a guest
 * their session mid-checkout, right after a redirect payment.
 */
export function refreshSession(): Promise<string | null> {
  refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

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

    const token = await refreshSession();

    if (!token) {
      useAuthStore.getState().clear();
      if (typeof window !== "undefined") {
        // Carry the page along: a guest bounced from the confirmation screen
        // after paying should land back on it once they sign in, not on the
        // home page wondering what happened to their money.
        const returnTo = window.location.pathname + window.location.search;
        const isLogin = window.location.pathname.startsWith("/login");
        window.location.assign(
          isLogin ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`,
        );
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
