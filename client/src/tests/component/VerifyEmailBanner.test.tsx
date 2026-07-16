import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: { resendVerification: vi.fn() },
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: vi.fn(),
}));

type MockState = {
  status: "idle" | "loading" | "authed" | "anon";
  user: { emailVerified: boolean } | null;
};

function mockAuthState(state: MockState) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: MockState) => unknown) => selector(state),
  );
}

describe("VerifyEmailBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when signed out", () => {
    mockAuthState({ status: "anon", user: null });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the user is already verified", () => {
    mockAuthState({ status: "authed", user: { emailVerified: true } });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the banner when authed and unverified", () => {
    mockAuthState({ status: "authed", user: { emailVerified: false } });
    render(<VerifyEmailBanner />);
    expect(
      screen.getByText("Verify your email to unlock bookings and hosting. Check your inbox."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend email" })).toBeInTheDocument();
  });

  it("resend click calls the endpoint, toasts success, and starts a cooldown", async () => {
    mockAuthState({ status: "authed", user: { emailVerified: false } });
    (endpoints.resendVerification as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { toast } = await import("sonner");

    render(<VerifyEmailBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => expect(endpoints.resendVerification).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Verification email sent"));

    const button = screen.getByRole("button", { name: /Resend in \d+s/ });
    expect(button).toBeDisabled();
  });

  it("shows the server's rate-limit message on 429 without starting a cooldown", async () => {
    mockAuthState({ status: "authed", user: { emailVerified: false } });
    (endpoints.resendVerification as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Too many verification emails requested. Please try again later."),
    );
    const { toast } = await import("sonner");

    render(<VerifyEmailBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Too many verification emails requested. Please try again later.",
      ),
    );
    expect(screen.getByRole("button", { name: "Resend email" })).not.toBeDisabled();
  });
});
