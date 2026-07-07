import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FavoriteButton } from "@/components/property/favorite-button";
import { useFavorites } from "@/components/property/use-favorites";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/properties/prop-1",
}));

vi.mock("@/components/property/use-favorites", () => ({
  useFavorites: vi.fn(),
}));

function mockFavorites(overrides: Partial<ReturnType<typeof useFavorites>> = {}) {
  const toggle = vi.fn();
  (useFavorites as ReturnType<typeof vi.fn>).mockReturnValue({
    isAuthed: true,
    isFavorite: () => false,
    toggle,
    ids: new Set<string>(),
    ...overrides,
  });
  return toggle;
}

describe("FavoriteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders inactive with aria-pressed=false and the right label (overlay)", () => {
    mockFavorites({ isFavorite: () => false });
    render(<FavoriteButton propertyId="prop-1" variant="overlay" />);

    const button = screen.getByRole("button", { name: "Add to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("renders active with aria-pressed=true and the right label (overlay)", () => {
    mockFavorites({ isFavorite: () => true });
    render(<FavoriteButton propertyId="prop-1" variant="overlay" />);

    const button = screen.getByRole("button", { name: "Remove from favorites" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("calls toggle with the propertyId when an authed user clicks", async () => {
    const toggle = mockFavorites({ isAuthed: true, isFavorite: () => false });
    render(<FavoriteButton propertyId="prop-1" variant="overlay" />);

    await userEvent.click(screen.getByRole("button", { name: "Add to favorites" }));

    expect(toggle).toHaveBeenCalledWith("prop-1");
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to login instead of toggling when the user is anon", async () => {
    const toggle = mockFavorites({ isAuthed: false, isFavorite: () => false });
    render(<FavoriteButton propertyId="prop-1" variant="overlay" />);

    await userEvent.click(screen.getByRole("button", { name: "Add to favorites" }));

    expect(toggle).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent("/properties/prop-1")}`,
    );
  });

  it("labeled variant shows Save/Saved text", () => {
    mockFavorites({ isFavorite: () => true });
    render(<FavoriteButton propertyId="prop-1" variant="labeled" />);

    expect(screen.getByRole("button", { name: "Remove from favorites" })).toHaveTextContent(
      "Saved",
    );
  });
});
