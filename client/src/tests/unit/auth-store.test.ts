import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";

const mockUser: AuthUser = {
  id: "1",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  role: "USER",
  avatarUrl: null,
};

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, status: "idle" });
});

describe("useAuthStore", () => {
  it("starts idle with no token/user", () => {
    const { accessToken, user, status } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
    expect(status).toBe("idle");
  });

  it("setAuth stores token, user, and sets status authed", () => {
    useAuthStore.getState().setAuth("tok_abc", mockUser);
    const { accessToken, user, status } = useAuthStore.getState();
    expect(accessToken).toBe("tok_abc");
    expect(user).toEqual(mockUser);
    expect(status).toBe("authed");
  });

  it("clear wipes token and user, sets status anon", () => {
    useAuthStore.getState().setAuth("tok_abc", mockUser);
    useAuthStore.getState().clear();
    const { accessToken, user, status } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
    expect(status).toBe("anon");
  });

  it("setStatus updates status independently", () => {
    useAuthStore.getState().setStatus("loading");
    expect(useAuthStore.getState().status).toBe("loading");
  });
});
