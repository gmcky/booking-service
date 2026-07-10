import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BookingsPage from "@/app/(app)/bookings/page";
import type { BookingListItem, BookingStatus } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/utils/money";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/bookings", () => ({
  bookingApi: {
    list: vi.fn(),
    cancel: vi.fn(),
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

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function makeBooking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: "booking-1",
    propertyId: "prop-1",
    userId: "user-1",
    checkIn: hoursFromNow(72),
    checkOut: hoursFromNow(72 + 48),
    guests: 2,
    totalPrice: "500",
    status: "CONFIRMED" as BookingStatus,
    payoutStatus: "PENDING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actualCheckOutAt: null,
    property: { id: "prop-1", title: "Pine Ridge Cabin", city: "Austin", images: [] },
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingsPage />
    </QueryClientProvider>,
  );
}

async function openCancelDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  return screen.getByRole("alertdialog");
}

describe("BookingsPage cancel dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: "tok_abc", user: mockUser, status: "authed" });
  });

  it("shows a 100% refund preview for a CONFIRMED booking more than 48h from check-in", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeBooking({ checkIn: hoursFromNow(72), totalPrice: "500" })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();
    await screen.findByText("Pine Ridge Cabin");

    const dialog = await openCancelDialog();
    expect(dialog).toHaveTextContent(`You'll receive a 100% refund (${formatPrice(500)}).`);
  });

  it("hides the cancel button for a CONFIRMED booking within 24h of check-in (0% refund)", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeBooking({ checkIn: hoursFromNow(12), totalPrice: "500" })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();
    await screen.findByText("Pine Ridge Cabin");

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByText(/Free cancellation ended/)).toBeInTheDocument();
    expect(screen.getByText(/non-refundable/)).toBeInTheDocument();
  });

  it("shows no refund preview line for a PENDING booking (gate is status === CONFIRMED)", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeBooking({ status: "PENDING" as BookingStatus, checkIn: hoursFromNow(72) })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();
    await screen.findByText("Pine Ridge Cabin");

    const dialog = await openCancelDialog();
    expect(dialog).not.toHaveTextContent(/refund/i);
    expect(dialog).toHaveTextContent(
      "This will cancel your reservation at Pine Ridge Cabin. This can't be undone.",
    );
  });

  it("confirming the dialog calls bookingApi.cancel with the booking id", async () => {
    const { bookingApi } = await import("@/lib/api/bookings");
    (bookingApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeBooking({ id: "booking-42", checkIn: hoursFromNow(72) })],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    (bookingApi.cancel as ReturnType<typeof vi.fn>).mockResolvedValue({
      cancellation: { refundPercent: 100, refundAmount: 500 },
    });

    renderPage();
    await screen.findByText("Pine Ridge Cabin");

    const dialog = await openCancelDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));

    await waitFor(() => {
      expect(bookingApi.cancel).toHaveBeenCalledWith("booking-42");
    });
  });
});
