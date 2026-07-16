import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { endpoints } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: { verifyEmail: vi.fn() },
}));

const markEmailVerified = vi.fn();
vi.mock("@/lib/auth/store", () => ({
  useAuthStore: vi.fn(),
}));

describe("VerifyEmailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: { markEmailVerified: () => void }) => unknown) =>
        selector({ markEmailVerified }),
    );
  });

  it("shows an error state immediately when there's no token", () => {
    render(<VerifyEmailView token={null} />);
    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(
      screen.getByText("You can request a new link from the banner after signing in."),
    ).toBeInTheDocument();
    expect(endpoints.verifyEmail).not.toHaveBeenCalled();
  });

  it("verifies the token once on mount and shows the success state", async () => {
    (endpoints.verifyEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    render(<VerifyEmailView token="tok-123" />);

    expect(screen.getByText("Verifying your email")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Email verified")).toBeInTheDocument());
    expect(endpoints.verifyEmail).toHaveBeenCalledTimes(1);
    expect(endpoints.verifyEmail).toHaveBeenCalledWith("tok-123");
    expect(markEmailVerified).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Back to home" })).toHaveAttribute("href", "/");
  });

  it("shows the server's error message when the token is invalid or expired", async () => {
    (endpoints.verifyEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("This verification link is invalid or has expired. Request a new one from your profile."),
    );

    render(<VerifyEmailView token="bad-token" />);

    await waitFor(() => expect(screen.getByText("Verification failed")).toBeInTheDocument());
    expect(
      screen.getByText(
        "This verification link is invalid or has expired. Request a new one from your profile.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can request a new link from the banner after signing in."),
    ).toBeInTheDocument();
    expect(markEmailVerified).not.toHaveBeenCalled();
  });
});
