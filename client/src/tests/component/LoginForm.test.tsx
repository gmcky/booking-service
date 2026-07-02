import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/auth/LoginForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: {
    login: vi.fn(),
  },
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: (selector: (s: { setAuth: () => void }) => unknown) =>
    selector({ setAuth: vi.fn() }),
}));

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("shows validation errors for empty submit", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });
  });
});
