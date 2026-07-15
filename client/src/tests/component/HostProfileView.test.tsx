import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HostProfileView } from "@/components/host/host-profile-view";
import { userApi, type PublicUserProfile, type HostReview } from "@/lib/api/users";
import { propertyApi, type Property } from "@/lib/api/properties";

vi.mock("@/lib/api/users", () => ({
  userApi: {
    publicProfile: vi.fn(),
    hostReviews: vi.fn(),
  },
}));

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    search: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/hosts/owner-1",
}));

vi.mock("@/components/property/use-favorites", () => ({
  useFavorites: () => ({
    isAuthed: false,
    isFavorite: () => false,
    toggle: vi.fn(),
    ids: new Set<string>(),
  }),
}));

const host: PublicUserProfile = {
  id: "owner-1",
  firstName: "Sam",
  lastName: "Host",
  avatarUrl: null,
  bio: "I love hosting travelers from all over the world.",
  createdAt: "2024-06-01T00:00:00.000Z",
  averageRating: 4.8,
  reviewsCount: 1,
  listingsCount: 1,
};

const review: HostReview = {
  id: "review-1",
  rating: 5,
  comment: "Wonderful stay!",
  createdAt: "2026-01-01T00:00:00.000Z",
  hostReplyText: null,
  hostReplyCreatedAt: null,
  user: { firstName: "Alex", lastName: "Guest", avatarUrl: null },
  property: { id: "property-1", title: "Cozy Loft Downtown" },
};

const property = {
  id: "property-1",
  title: "Cozy Loft Downtown",
  city: "Lisbon",
  pricePerNight: "120",
  averageRating: "4.90",
  images: [],
} as unknown as Property;

function renderView(id = "owner-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostProfileView id={id} />
    </QueryClientProvider>,
  );
}

describe("HostProfileView", () => {
  beforeEach(() => {
    vi.mocked(userApi.publicProfile).mockReset();
    vi.mocked(userApi.hostReviews).mockReset();
    vi.mocked(propertyApi.search).mockReset();
    vi.useFakeTimers({ now: new Date("2026-07-07T00:00:00.000Z"), toFake: ["Date"] });
  });

  it("renders profile name, stats, bio, a review and a listing", async () => {
    vi.mocked(userApi.publicProfile).mockResolvedValue(host);
    vi.mocked(userApi.hostReviews).mockResolvedValue({
      data: [review],
      pagination: { page: 1, limit: 6, total: 1, totalPages: 1 },
    });
    vi.mocked(propertyApi.search).mockResolvedValue({
      data: [property],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    renderView();

    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("4.80")).toBeInTheDocument();
    expect(screen.getByText("Years hosting")).toBeInTheDocument();
    expect(screen.getByText(host.bio!)).toBeInTheDocument();
    expect(screen.getByText("Hosting since June 2024")).toBeInTheDocument();

    expect(await screen.findByText("Wonderful stay!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cozy Loft Downtown" })).toBeInTheDocument();

    expect(await screen.findByText("Sam's listings")).toBeInTheDocument();
  });

  it("shows a friendly not-found state on 404", async () => {
    vi.mocked(userApi.publicProfile).mockRejectedValue(new Error("User not found"));

    renderView("missing-user");

    expect(await screen.findByText("Host not found")).toBeInTheDocument();
  });
});
