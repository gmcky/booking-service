import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

describe("mobile map list sheet", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    // The sheet is the mobile branch of the map overlay, so this suite has to
    // answer the phone-width media query the desktop suites leave false.
    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 1023px)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

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

  it("carries the result count and the list itself over the map", async () => {
    renderBrowse();
    await userEvent.click(await screen.findByRole("button", { name: "Show map" }));

    // The count used to live on a "Show list · N homes" button; the handle owns
    // it now, and the list is right underneath instead of behind the map.
    const handle = await screen.findByRole("button", { name: "Expand list" });
    expect(handle).toHaveTextContent("1 home");
    expect(handle).toHaveAttribute("aria-expanded", "false");

    const sheet = handle.parentElement!;
    expect(await within(sheet).findByText("Canal House")).toBeInTheDocument();
  });

  it("opens and closes from the handle in one tap each", async () => {
    renderBrowse();
    await userEvent.click(await screen.findByRole("button", { name: "Show map" }));

    // Two states on tap: open or closed. The taller snap exists, but it's a
    // drag away — cycling three states through one control meant two taps to
    // get anywhere and a guess about where you'd land.
    await userEvent.click(await screen.findByRole("button", { name: "Expand list" }));
    const opened = await screen.findByRole("button", { name: "Collapse list" });
    expect(opened).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(opened);
    expect(await screen.findByRole("button", { name: "Expand list" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
