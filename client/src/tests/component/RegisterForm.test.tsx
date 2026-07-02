import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "@/components/auth/RegisterForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: {
    register: vi.fn(),
  },
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: (selector: (s: { setAuth: () => void }) => unknown) =>
    selector({ setAuth: vi.fn() }),
}));

describe("RegisterForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders firstName, lastName, email and password fields", () => {
    render(<RegisterForm />);
    expect(screen.getByPlaceholderText("Jane")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Smith")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min 8 characters")).toBeInTheDocument();
  });

  it("shows validation errors for empty submit", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText("First name is required")).toBeInTheDocument();
      expect(screen.getByText("Last name is required")).toBeInTheDocument();
    });
  });

  it("blocks submit and surfaces a message when the password is too weak", async () => {
    const { endpoints } = await import("@/lib/api/endpoints");
    render(<RegisterForm />);

    await userEvent.type(screen.getByPlaceholderText("Jane"), "Jane");
    await userEvent.type(screen.getByPlaceholderText("Smith"), "Smith");
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "jane@example.com");
    await userEvent.type(screen.getByPlaceholderText("Min 8 characters"), "password");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Password is too weak or common. Please use a stronger password."),
      ).toBeInTheDocument();
    });
    expect(endpoints.register).not.toHaveBeenCalled();
  });
});
