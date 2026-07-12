import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NearbyStays } from "@/components/property/nearby-stays";
import { propertyApi, type Property } from "@/lib/api/properties";

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    search: vi.fn(),
  },
}));

// PropertyCard renders FavoriteButton, which needs next/navigation (no app
// router mounted under Vitest) and the favorites ids query.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/properties/current",
}));

vi.mock("@/lib/api/favorites", () => ({
  favoriteApi: {
    ids: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

function makeProperty(id: string, overrides: Partial<Property> = {}): Property {
  return {
    id,
    title: `Stay ${id}`,
    city: "Amsterdam",
    pricePerNight: "150",
    averageRating: null,
    images: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function renderNearby(propertyId = "current") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NearbyStays propertyId={propertyId} city="Amsterdam" country="Netherlands" />
    </QueryClientProvider>,
  );
}

describe("NearbyStays", () => {
  beforeEach(() => {
    vi.mocked(propertyApi.search).mockReset();
  });

  it("renders cards for the same city, excluding the current property", async () => {
    vi.mocked(propertyApi.search).mockResolvedValue({
      data: [makeProperty("current"), makeProperty("p1"), makeProperty("p2")],
      pagination: { page: 1, limit: 13, total: 3, totalPages: 1 },
    });

    renderNearby();

    expect(await screen.findByText("More stays nearby")).toBeInTheDocument();
    expect(screen.getByText("Stay p1")).toBeInTheDocument();
    expect(screen.getByText("Stay p2")).toBeInTheDocument();
    expect(screen.queryByText("Stay current")).not.toBeInTheDocument();

    expect(propertyApi.search).toHaveBeenCalledTimes(1);
    expect(propertyApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Amsterdam", limit: 13 }),
    );
  });

  it("falls back to a country fetch when the city returns fewer than 2 others", async () => {
    vi.mocked(propertyApi.search).mockImplementation((query) => {
      if (query?.country) {
        return Promise.resolve({
          data: [makeProperty("current"), makeProperty("c1"), makeProperty("c2")],
          pagination: { page: 1, limit: 13, total: 3, totalPages: 1 },
        });
      }
      return Promise.resolve({
        data: [makeProperty("current")],
        pagination: { page: 1, limit: 13, total: 1, totalPages: 1 },
      });
    });

    renderNearby();

    expect(await screen.findByText("Other places in Netherlands")).toBeInTheDocument();
    expect(screen.getByText("Stay c1")).toBeInTheDocument();
    expect(screen.getByText("Stay c2")).toBeInTheDocument();
    expect(screen.queryByText("Stay current")).not.toBeInTheDocument();

    expect(propertyApi.search).toHaveBeenCalledTimes(2);
    expect(propertyApi.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ country: "Netherlands", limit: 13 }),
    );
  });

  it("renders nothing when both city and country fetches come up empty", async () => {
    vi.mocked(propertyApi.search).mockResolvedValue({
      data: [makeProperty("current")],
      pagination: { page: 1, limit: 13, total: 1, totalPages: 1 },
    });

    const { container } = renderNearby();

    await waitFor(() => expect(propertyApi.search).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
