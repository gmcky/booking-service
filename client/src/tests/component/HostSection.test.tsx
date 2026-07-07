import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HostSection } from "@/components/property/host-section";
import { userApi, type PublicUserProfile } from "@/lib/api/users";

vi.mock("@/lib/api/users", () => ({
  userApi: {
    publicProfile: vi.fn(),
  },
}));

const host: PublicUserProfile = {
  id: "owner-1",
  firstName: "Sam",
  lastName: "Host",
  avatarUrl: null,
  // ~2 years before the mocked "now" below
  createdAt: "2024-06-01T00:00:00.000Z",
  averageRating: 4.8,
  reviewsCount: 12,
  listingsCount: 3,
};

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostSection ownerId="owner-1" />
    </QueryClientProvider>,
  );
}

describe("HostSection", () => {
  beforeEach(() => {
    vi.mocked(userApi.publicProfile).mockReset();
    vi.useFakeTimers({ now: new Date("2026-07-07T00:00:00.000Z"), toFake: ["Date"] });
  });

  it("renders host name, stats and hosting duration", async () => {
    vi.mocked(userApi.publicProfile).mockResolvedValue(host);

    renderSection();

    expect(await screen.findByText("Meet your host")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("3 listings")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("4.80")).toBeInTheDocument();
    expect(screen.getByText("Years hosting")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("omits the rating row when the host has no reviews", async () => {
    vi.mocked(userApi.publicProfile).mockResolvedValue({
      ...host,
      averageRating: null,
      reviewsCount: 0,
    });

    renderSection();

    expect(await screen.findByText("Meet your host")).toBeInTheDocument();
    expect(screen.queryByText("Rating")).not.toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
  });

  it("renders nothing until the profile loads", () => {
    vi.mocked(userApi.publicProfile).mockReturnValue(new Promise(() => {}));

    const { container } = renderSection();

    expect(container).toBeEmptyDOMElement();
  });
});
