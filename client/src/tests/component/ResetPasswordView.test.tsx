import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordView } from "@/components/auth/reset-password-view";
import { endpoints } from "@/lib/api/endpoints";

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: { resetPassword: vi.fn() },
}));

describe("ResetPasswordView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an immediate error state when there's no token", () => {
    render(<ResetPasswordView token={null} />);
    expect(screen.getByText("Invalid reset link")).toBeInTheDocument();
    expect(
      screen.getByText("This password reset link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(endpoints.resetPassword).not.toHaveBeenCalled();
  });

  it("renders new password and confirm password fields when a token is present", () => {
    render(<ResetPasswordView token="tok-123" />);
    expect(screen.getByPlaceholderText("Min 8 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Re-enter your password")).toBeInTheDocument();
  });

  it("shows a validation error when passwords don't match", async () => {
    render(<ResetPasswordView token="tok-123" />);
    await userEvent.type(screen.getByPlaceholderText("Min 8 characters"), "goodPassword1");
    await userEvent.type(screen.getByPlaceholderText("Re-enter your password"), "otherPassword1");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(endpoints.resetPassword).not.toHaveBeenCalled();
  });

  it("calls resetPassword with the token and password, and shows the success state", async () => {
    (endpoints.resetPassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    render(<ResetPasswordView token="tok-123" />);
    await userEvent.type(screen.getByPlaceholderText("Min 8 characters"), "goodPassword1");
    await userEvent.type(screen.getByPlaceholderText("Re-enter your password"), "goodPassword1");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(screen.getByText("Password updated")).toBeInTheDocument());
    expect(screen.getByText("All your sessions have been signed out.")).toBeInTheDocument();
    expect(endpoints.resetPassword).toHaveBeenCalledWith("tok-123", "goodPassword1");
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows the server's error message inline with a link to request a new link", async () => {
    (endpoints.resetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("This reset link is invalid or has expired."),
    );

    render(<ResetPasswordView token="tok-123" />);
    await userEvent.type(screen.getByPlaceholderText("Min 8 characters"), "goodPassword1");
    await userEvent.type(screen.getByPlaceholderText("Re-enter your password"), "goodPassword1");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText("This reset link is invalid or has expired.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByText("Password updated")).not.toBeInTheDocument();
  });
});
