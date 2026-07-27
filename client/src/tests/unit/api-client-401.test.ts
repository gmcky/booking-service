import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/store";

/**
 * openapi-fetch captures `globalThis.fetch` as `baseFetch` inside
 * `createClient()` itself (see node_modules/openapi-fetch/src/index.js),
 * not per-request. That means stubbing global fetch after `apiClient` has
 * already been created (e.g. via a static top-of-file import) does nothing —
 * the client keeps calling the original fetch it captured at import time.
 * So each test stubs fetch first, then resets the module registry and
 * dynamically imports the client (and the auth store, from the same fresh
 * graph) so the new client captures the stub.
 */
async function loadFreshClient(mockFetch: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal("fetch", mockFetch);
  const [clientModule, storeModule] = await Promise.all([
    import("@/lib/api/client"),
    import("@/lib/auth/store"),
  ]);
  return { apiClient: clientModule.apiClient, useAuthStore: storeModule.useAuthStore };
}

const mockUser: AuthUser = {
  id: "1",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  role: "USER",
  avatarUrl: null,
  emailVerified: true,
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The client calls `fetch` two different ways: openapi-fetch always passes a
 * `Request` object, but `refreshAccessToken()` (and the manual retry) call
 * plain `fetch(urlString, init)`. Normalize both into a Request so mocks can
 * uniformly read `.url` / `.headers`.
 */
function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input, init);
}

let assignMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom does not implement navigation, so window.location.assign throws
  // "Not implemented" if called for real. Swap in a plain object so the
  // client's redirect-on-logout call is observable instead of crashing.
  assignMock = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign: assignMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("apiClient 401 handling", () => {
  it("single-flights a refresh across concurrent 401s and retries both requests", async () => {
    let refreshCalls = 0;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = toRequest(input, init);
      const url = new URL(req.url);
      if (url.pathname.includes("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse({ accessToken: "new" }, 200);
      }
      const auth = req.headers.get("Authorization");
      if (auth === "Bearer new") {
        return jsonResponse({ id: "1" }, 200);
      }
      return jsonResponse({ message: "unauthorized" }, 401);
    });

    const { apiClient, useAuthStore } = await loadFreshClient(mockFetch as unknown as typeof fetch);
    useAuthStore.getState().setAuth("old", mockUser);

    const [res1, res2] = await Promise.all([apiClient.GET("/users/me"), apiClient.GET("/users/me")]);

    expect(refreshCalls).toBe(1);
    expect(res1.response.status).toBe(200);
    expect(res2.response.status).toBe(200);
    expect(useAuthStore.getState().accessToken).toBe("new");
  });

  it("shares one refresh with the session bootstrap", async () => {
    // A cold page load restores the session while a protected query on the
    // same page hits a 401 and wants a refresh too. Refresh tokens rotate, so
    // a second call carrying the token the first one replaced reads as reuse
    // and the server revokes every session the visitor has — they get thrown
    // out of their own account, mid-checkout in the case that found this.
    let refreshCalls = 0;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = toRequest(input, init);
      const url = new URL(req.url);
      if (url.pathname.includes("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse({ accessToken: "fresh" }, 200);
      }
      return req.headers.get("Authorization") === "Bearer fresh"
        ? jsonResponse({ id: "1" }, 200)
        : jsonResponse({ message: "unauthorized" }, 401);
    });

    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);
    const [clientModule, storeModule] = await Promise.all([
      import("@/lib/api/client"),
      import("@/lib/auth/store"),
    ]);
    storeModule.useAuthStore.getState().clear();

    const [bootstrapToken, query] = await Promise.all([
      clientModule.refreshSession(),
      clientModule.apiClient.GET("/users/me"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(bootstrapToken).toBe("fresh");
    expect(query.response.status).toBe(200);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("does not attempt a refresh on a 401 from an auth route", async () => {
    const mockFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ message: "bad credentials" }, 401),
    );

    const { apiClient, useAuthStore } = await loadFreshClient(mockFetch as unknown as typeof fetch);
    useAuthStore.getState().setAuth("old", mockUser);

    const { response } = await apiClient.POST("/auth/logout");

    expect(response.status).toBe(401);
    const refreshCalls = mockFetch.mock.calls.filter(([input, init]) =>
      toRequest(input, init).url.includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(0);
    // untouched: no retry happened, so only the one original call was made
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("clears the store and redirects to /login when refresh fails", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = toRequest(input, init);
      const url = new URL(req.url);
      if (url.pathname.includes("/auth/refresh")) {
        return jsonResponse({ message: "invalid refresh token" }, 401);
      }
      return jsonResponse({ message: "unauthorized" }, 401);
    });

    const { apiClient, useAuthStore } = await loadFreshClient(mockFetch as unknown as typeof fetch);
    useAuthStore.getState().setAuth("old", mockUser);

    const { response } = await apiClient.GET("/users/me");

    expect(response.status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().status).toBe("anon");
    // With the page carried along, so signing in lands back where the guest
    // was rather than on the home page.
    expect(assignMock).toHaveBeenCalledWith(expect.stringMatching(/^\/login(\?returnTo=|$)/));
  });

  it("attaches the Bearer token and does not refresh on a happy-path 200", async () => {
    let capturedAuth: string | null = null;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = toRequest(input, init);
      capturedAuth = req.headers.get("Authorization");
      return jsonResponse({ id: "1" }, 200);
    });

    const { apiClient, useAuthStore } = await loadFreshClient(mockFetch as unknown as typeof fetch);
    useAuthStore.getState().setAuth("current-token", mockUser);

    const { response } = await apiClient.GET("/users/me");

    expect(response.status).toBe(200);
    expect(capturedAuth).toBe("Bearer current-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
