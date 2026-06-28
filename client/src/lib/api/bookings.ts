import { BASE_URL } from "./client";
import { useAuthStore } from "@/lib/auth/store";
import type { Paginated, PropertyType } from "./properties";

export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface BookingListItem {
  id: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  totalPrice: string;
  guests: number;
  status: BookingStatus;
  createdAt: string;
  property: { id: string; title: string; city: string; images: string[] };
}

export interface BookingDetail {
  id: string;
  propertyId: string;
  userId: string;
  checkIn: string;
  checkOut: string;
  totalPrice: string;
  guests: number;
  status: BookingStatus;
  createdAt: string;
  property: {
    id: string;
    title: string;
    type: PropertyType;
    city: string;
    address: string;
    images: string[];
    pricePerNight: string;
    averageRating: string | null;
    reviewCount: number;
  };
  payment: {
    id: string;
    amount: string;
    currency: string;
    status: string;
  } | null;
}

export interface CreateBookingInput {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { message?: string }).message ?? "Request failed");
  }
  return json as T;
}

/** Backend expects ISO datetime; query params carry date-only strings. */
function toISODateTime(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export const bookingApi = {
  list: () => request<Paginated<BookingListItem>>("GET", "/bookings"),

  byId: (id: string) => request<BookingDetail>("GET", `/bookings/${id}`),

  create: (input: CreateBookingInput) =>
    request<BookingDetail>("POST", "/bookings", {
      propertyId: input.propertyId,
      checkIn: toISODateTime(input.checkIn),
      checkOut: toISODateTime(input.checkOut),
      guests: input.guests,
    }),

  createPaymentIntent: (bookingId: string) =>
    request<{ clientSecret: string }>("POST", "/payments/intent", { bookingId }),

  cancel: (id: string) => request<unknown>("DELETE", `/bookings/${id}`),
};
