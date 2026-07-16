import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/endpoints", () => ({
  endpoints: {
    googleSignIn: vi.fn(),
  },
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: (selector: (s: { setAuth: () => void }) => unknown) =>
    selector({ setAuth: vi.fn() }),
}));

type MockGoogleId = {
  initialize: ReturnType<typeof vi.fn>;
  renderButton: ReturnType<typeof vi.fn>;
};

function installMockGoogle(): MockGoogleId {
  const mockGoogleId: MockGoogleId = {
    initialize: vi.fn(),
    renderButton: vi.fn(),
  };
  (window as unknown as { google?: unknown }).google = {
    accounts: { id: mockGoogleId },
  };
  return mockGoogleId;
}

describe("GoogleSignInButton", () => {
  const originalClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalClientId;
    delete (window as unknown as { google?: unknown }).google;
  });

  it("renders a container for the Google button", () => {
    installMockGoogle();
    const { container } = render(<GoogleSignInButton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("initializes GIS and renders the button once the script is available", async () => {
    const mockGoogleId = installMockGoogle();

    render(<GoogleSignInButton />);

    await waitFor(() => {
      expect(mockGoogleId.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: "test-client-id.apps.googleusercontent.com" }),
      );
      expect(mockGoogleId.renderButton).toHaveBeenCalledTimes(1);
    });
  });

  it("renders nothing when no client ID is configured", () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";
    installMockGoogle();

    const { container } = render(<GoogleSignInButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an error toast when the sign-in exchange fails", async () => {
    const mockGoogleId = installMockGoogle();
    const { endpoints } = await import("@/lib/api/endpoints");
    const { toast } = await import("sonner");
    vi.mocked(endpoints.googleSignIn).mockRejectedValueOnce(
      new Error("Invalid Google credential"),
    );

    render(<GoogleSignInButton />);

    await waitFor(() => expect(mockGoogleId.initialize).toHaveBeenCalledTimes(1));

    const { callback } = mockGoogleId.initialize.mock.calls[0]![0] as {
      callback: (response: { credential: string }) => void;
    };
    callback({ credential: "fake-credential" });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invalid Google credential");
    });
  });
});
