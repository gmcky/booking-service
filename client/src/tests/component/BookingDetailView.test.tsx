import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookingDetailView } from "@/components/bookings/booking-detail-view";
import type { BookingDetail } from "@/lib/api/bookings";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/bookings", () => ({
  bookingApi: {
    byId: vi.fn(),
    cancel: vi.fn(),
  },
}));

const mockUser: AuthUser = {
  id: "guest-1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  role: "USER",
  avatarUrl: null,
  emailVerified: true,
};

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function makeBooking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: "booking-1",
    propertyId: "prop-1",
    userId: "guest-1",
    checkIn: hoursFromNow(72),
    checkOut: hoursFromNow(72 + 48),
    guests: 2,
    totalPrice: "500",
    status: "CONFIRMED",
    payoutStatus: "PENDING",
    cancelledBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actualCheckOutAt: null,
    property: {
      id: "prop-1",
      title: "Pine Ridge Cabin",
      description: "A cabin",
      type: "HOUSE",
      city: "Austin",
      district: null,
      street: "Pine Ridge Rd",
      houseNumber: "123",
      apartment: null,
      images: [],
      pricePerNight: "100",
      maxGuests: 4,
      petsAllowed: false,
      infantsAllowed: true,
      amenities: [],
      averageRating: null,
      reviewCount: 0,
      ownerId: "host-1",
      owner: {
        id: "host-1",
        firstName: "Alex",
        lastName: "Kovalenko",
        avatarUrl: null,
      },
    },
    payment: null,
    hostContact: null,
    pendingHostCancellation: null,
    ...overrides,
  };
}

function renderView(id = "booking-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingDetailView id={id} />
    </QueryClientProvider>,
  );
}

describe("BookingDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: "tok_abc", user: mockUser, status: "authed" });
  });

  it("shows the cancel button for a CONFIRMED booking more than 48h from check-in", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBooking({ checkIn: hoursFromNow(72) }),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("hides the cancel button and shows the non-refundable line within 24h of check-in", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBooking({ checkIn: hoursFromNow(12) }),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByText("Free cancellation ended · non-refundable")).toBeInTheDocument();
  });

  it("renders host phone and email when hostContact is present", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBooking({
        hostContact: { phoneNumber: "+380501234567", email: "owner@demo.com" },
      }),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(screen.getByText("+380501234567")).toBeInTheDocument();
    expect(screen.getByText("owner@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Pine Ridge Rd 123")).toBeInTheDocument();
  });

  it("shows the reveal-window message when CONFIRMED without hostContact", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBooking({ status: "CONFIRMED", hostContact: null }),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(screen.getByText("Host contact appears 2 days before check-in.")).toBeInTheDocument();
  });

  it("shows a pending message without contact links when booking is PENDING", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.byId as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBooking({ status: "PENDING", hostContact: null }),
    );

    renderView();
    await screen.findByText("Pine Ridge Cabin");

    expect(
      screen.getByText("Host contact appears once your booking is confirmed."),
    ).toBeInTheDocument();
    expect(screen.getByText("Pine Ridge Rd 123")).toBeInTheDocument();
    expect(screen.queryByText("+380501234567")).not.toBeInTheDocument();
  });
});
