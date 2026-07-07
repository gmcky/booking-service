import type { PropertyQuery } from "@/lib/api/properties";
import type { ReviewQuery } from "@/lib/api/reviews";

export const queryKeys = {
  properties: {
    all: ["properties"] as const,
    list: (query: PropertyQuery) => ["properties", "list", query] as const,
    browse: (query: PropertyQuery) => ["properties", "browse", query] as const,
    detail: (id: string) => ["properties", "detail", id] as const,
    mine: ["properties", "mine"] as const,
    locations: ["properties", "locations"] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    detail: (id: string) => ["bookings", "detail", id] as const,
    host: (query: Record<string, unknown>) => ["bookings", "host", query] as const,
    blockedDates: (propertyId: string) => ["bookings", "blocked-dates", propertyId] as const,
  },
  users: {
    me: ["users", "me"] as const,
    stats: ["users", "stats"] as const,
    publicProfile: (id: string) => ["users", "public-profile", id] as const,
  },
  reviews: {
    list: (propertyId: string, query: ReviewQuery) =>
      ["reviews", "list", propertyId, query] as const,
    stats: (propertyId: string) => ["reviews", "stats", propertyId] as const,
  },
} as const;
