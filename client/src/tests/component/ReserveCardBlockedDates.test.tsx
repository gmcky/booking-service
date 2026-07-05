import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyDetailView } from "@/components/property/property-detail-view";
import type { PropertyDetail } from "@/lib/api/properties";
import type { BlockedDates } from "@/lib/api/bookings";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    byId: vi.fn(),
  },
}));

vi.mock("@/lib/api/reviews", () => ({
  reviewApi: {
    stats: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/bookings", () => ({
  bookingApi: {
    blockedDates: vi.fn(),
    checkAvailability: vi.fn(),
  },
}));

const mockUser: AuthUser = {
  id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  role: "USER",
  avatarUrl: null,
};

const property: PropertyDetail = {
  id: "prop-1",
  title: "Pine Ridge Cabin",
  description: "A cozy cabin in the woods.",
  type: "HOUSE",
  city: "Austin",
  country: "United States",
  district: null,
  address: "1240 Lakeshore Dr",
  images: [],
  pricePerNight: "200",
  maxGuests: 4,
  petsAllowed: false,
  infantsAllowed: true,
  amenities: [],
  averageRating: null,
  reviewCount: 0,
  ownerId: "owner-1",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  owner: { id: "owner-1", firstName: "Sam", lastName: "Host" },
  reviews: [],
};

const emptyStats = {
  averageRating: null,
  totalReviews: 0,
  breakdown: {},
  recentTrend: [],
};

const emptyReviewList = {
  data: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local-date yyyy-MM-dd matching react-day-picker's CalendarDay#isoDate. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysLocal(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Built as UTC-midnight-of-the-local-calendar-day (same convention as
// toISODateTime elsewhere) so the fixture's date part is stable regardless
// of the machine's timezone.
function isoDateTime(d: Date): string {
  return `${isoDate(d)}T00:00:00.000Z`;
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PropertyDetailView id="prop-1" />
    </QueryClientProvider>,
  );
}

async function setupCommonMocks() {
  const { propertyApi } = await import("@/lib/api/properties");
  const { reviewApi } = await import("@/lib/api/reviews");
  (propertyApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(property);
  (reviewApi.stats as ReturnType<typeof vi.fn>).mockResolvedValue(emptyStats);
  (reviewApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(emptyReviewList);
}

describe("PropertyDetailView reserve card blocked dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: "tok_abc", user: mockUser, status: "authed" });
  });

  it("shows a checking-availability note while blockedDates is pending", async () => {
    await setupCommonMocks();
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.blockedDates as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(await screen.findByText("Checking availability…")).toBeInTheDocument();
  });

  it("shows a warning when blockedDates rejects", async () => {
    await setupCommonMocks();
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.blockedDates as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error"),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(await screen.findByText(/Couldn't load availability/)).toBeInTheDocument();
  });

  it("disables booked nights in the check-in picker but leaves the checkout day free", async () => {
    await setupCommonMocks();
    const { bookingApi } = await import("@/lib/api/bookings");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookedFrom = addDaysLocal(today, 10);
    const bookedMiddle = addDaysLocal(today, 11);
    const bookedTo = addDaysLocal(today, 13); // checkout day: free for a new arrival

    const blocked: BlockedDates = {
      bookedRanges: [{ checkIn: isoDateTime(bookedFrom), checkOut: isoDateTime(bookedTo) }],
      blockedRanges: [],
    };
    (bookingApi.blockedDates as ReturnType<typeof vi.fn>).mockResolvedValue(blocked);

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    // The trigger's accessible name composes the field name with the current
    // value ("Check in, Add date" / "Check in, Jul 13, 2026") via aria-label,
    // which wins over the layout <Label> wrapping the picker.
    const checkInTrigger = await screen.findByRole("button", { name: "Check in, Add date" });
    await userEvent.click(checkInTrigger);

    // Scope all queries to the picker's popover — the page also renders an
    // inline availability calendar with its own day cells and nav buttons.
    function popoverEl(): HTMLElement {
      const el = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
      if (!el) throw new Error("date picker popover not found");
      return el;
    }

    // The calendar opens showing the current month; if the target day
    // isn't in view (the ~10-13-day-out range rolled into next month),
    // navigate forward once — the two target dates are only 3 days apart
    // so they can never span more than one month boundary.
    async function locateDayCell(iso: string): Promise<HTMLElement> {
      let cell = popoverEl().querySelector<HTMLElement>(`[data-day="${iso}"]`);
      if (!cell) {
        await userEvent.click(
          within(popoverEl()).getByRole("button", { name: "Go to the Next Month" }),
        );
        cell = popoverEl().querySelector<HTMLElement>(`[data-day="${iso}"]`);
      }
      if (!cell) throw new Error(`day cell ${iso} not found even after month navigation`);
      return cell;
    }

    const disabledCell = await locateDayCell(isoDate(bookedMiddle));
    expect(disabledCell.querySelector("button")).toBeDisabled();

    const checkoutCell = await locateDayCell(isoDate(bookedTo));
    expect(checkoutCell.querySelector("button")).not.toBeDisabled();
  });
});
