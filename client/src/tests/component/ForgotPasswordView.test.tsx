import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordView } from "@/components/auth/forgot-password-view";
import { endpoints } from "@/lib/api/endpoints";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: { forgotPassword: vi.fn() },
}));

describe("ForgotPasswordView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the email field", () => {
    render(<ForgotPasswordView />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("shows a validation error for empty submit", async () => {
    render(<ForgotPasswordView />);
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });
    expect(endpoints.forgotPassword).not.toHaveBeenCalled();
  });

  it("always flips to the success state on a successful submit", async () => {
    (endpoints.forgotPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    render(<ForgotPasswordView />);
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
    expect(
      screen.getByText(
        "If an account exists for that email, a reset link is on its way. The link expires in 1 hour.",
      ),
    ).toBeInTheDocument();
    expect(endpoints.forgotPassword).toHaveBeenCalledWith("someone@example.com");
    expect(screen.getByRole("button", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("toasts and stays on the form when the request itself fails", async () => {
    const { toast } = await import("sonner");
    (endpoints.forgotPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(<ForgotPasswordView />);
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network error"));
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
  });
});
