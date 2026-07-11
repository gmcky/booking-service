import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowseView } from "@/components/property/browse-view";
import { propertyApi } from "@/lib/api/properties";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/browse",
}));

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    search: vi.fn(),
    locations: vi.fn(),
    mapMarkers: vi.fn(),
  },
}));

vi.mock("@/lib/api/favorites", () => ({
  favoriteApi: {
    ids: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

// SearchPill/QuickFilters/FiltersDialog pull in their own heavy query/date
// logic that's irrelevant to the map toggle — stub them out so this test
// only exercises BrowseView's map split/list state.
vi.mock("@/components/search/search-pill", () => ({
  SearchPill: () => null,
}));
vi.mock("@/components/search/quick-filters", () => ({
  QuickFilters: () => null,
}));
vi.mock("@/components/search/filters-dialog", () => ({
  FiltersDialog: () => null,
}));

function renderBrowse() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrowseView />
    </QueryClientProvider>,
  );
}

describe("BrowseView map toggle", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    vi.mocked(propertyApi.search).mockResolvedValue({
      data: [
        {
          id: "prop-1",
          title: "Canal House",
          city: "Amsterdam",
          pricePerNight: "150",
          averageRating: null,
          images: [],
          latitude: 52.37,
          longitude: 4.9,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
    vi.mocked(propertyApi.locations).mockResolvedValue([]);
    vi.mocked(propertyApi.mapMarkers).mockResolvedValue([]);
  });

  it("defaults to list-only and toggles the map open", async () => {
    renderBrowse();

    const toggle = await screen.findByRole("button", { name: "Show map" });
    expect(toggle).toBeInTheDocument();
    expect(await screen.findByText("Canal House")).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(await screen.findByRole("button", { name: "Show list" })).toBeInTheDocument();
  });

  it("opens in split view when the URL carries a map-area bbox", async () => {
    // Restored map session (reload / shared link) — collapsing here would
    // filter by an area the user can't see.
    nav.params = new URLSearchParams(
      "minLat=52.1&maxLat=52.6&minLng=4.6&maxLng=5.2",
    );
    renderBrowse();

    expect(await screen.findByRole("button", { name: "Show list" })).toBeInTheDocument();
  });
});
