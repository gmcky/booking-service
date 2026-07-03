import { apiClient } from "./client";
import { unwrap } from "./unwrap";
import { toISODateTime } from "@/lib/utils/dates";
import type { components, paths } from "./schema";
import type { Paginated } from "./properties";

export type BookingStatus = components["schemas"]["BookingStatus"];
export type BookingListItem = components["schemas"]["BookingListItem"];
export type BookingWithProperty = components["schemas"]["BookingWithProperty"];
export type BookingDetail = components["schemas"]["BookingDetail"];
export type HostBooking = components["schemas"]["HostBooking"];

export type CancelBookingResult =
  paths["/bookings/{id}"]["delete"]["responses"]["200"]["content"]["application/json"];

export type BlockedDates = components["schemas"]["BlockedDates"];

export interface CreateBookingInput {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface HostBookingQuery {
  page?: number;
  limit?: number;
  status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  propertyId?: string;
}

export const bookingApi = {
  list: async (): Promise<Paginated<BookingListItem>> => {
    const { data, error, response } = await apiClient.GET("/bookings");
    return unwrap({ data, error, response });
  },

  byId: async (id: string): Promise<BookingDetail> => {
    const { data, error, response } = await apiClient.GET("/bookings/{id}", {
      params: { path: { id } },
    });
    return unwrap({ data, error, response });
  },

  create: async (input: CreateBookingInput): Promise<BookingWithProperty> => {
    const { data, error, response } = await apiClient.POST("/bookings", {
      body: {
        propertyId: input.propertyId,
        checkIn: toISODateTime(input.checkIn),
        checkOut: toISODateTime(input.checkOut),
        guests: input.guests,
      },
    });
    return unwrap({ data, error, response });
  },

  blockedDates: async (propertyId: string): Promise<BlockedDates> => {
    const { data, error, response } = await apiClient.GET("/bookings/{propertyId}/blocked-dates", {
      params: { path: { propertyId } },
    });
    return unwrap({ data, error, response });
  },

  checkAvailability: async (input: Omit<CreateBookingInput, "guests">): Promise<boolean> => {
    const { data, error, response } = await apiClient.POST("/bookings/check-availability", {
      body: {
        propertyId: input.propertyId,
        checkIn: toISODateTime(input.checkIn),
        checkOut: toISODateTime(input.checkOut),
      },
    });
    return unwrap({ data, error, response }).available;
  },

  createPaymentIntent: async (bookingId: string): Promise<{ clientSecret: string }> => {
    const { data, error, response } = await apiClient.POST("/payments/intent", {
      body: { bookingId },
    });
    return unwrap({ data, error, response });
  },

  cancel: async (id: string): Promise<CancelBookingResult> => {
    const { data, error, response } = await apiClient.DELETE("/bookings/{id}", {
      params: { path: { id } },
    });
    return unwrap({ data, error, response });
  },

  host: async (query: HostBookingQuery = {}): Promise<Paginated<HostBooking>> => {
    const { data, error, response } = await apiClient.GET("/bookings/host", {
      params: {
        query: {
          page: query.page,
          limit: query.limit,
          status: query.status,
          propertyId: query.propertyId,
        },
      },
    });
    return unwrap({ data, error, response });
  },

  updateStatus: async (
    id: string,
    status: "CONFIRMED" | "COMPLETED",
  ): Promise<components["schemas"]["Booking"]> => {
    const { data, error, response } = await apiClient.PATCH("/bookings/{id}/status", {
      params: { path: { id } },
      body: { status },
    });
    return unwrap({ data, error, response });
  },
};
