import type { PropertyQuery } from "@/lib/api/properties";

export const queryKeys = {
  properties: {
    all: ["properties"] as const,
    list: (query: PropertyQuery) => ["properties", "list", query] as const,
    browse: (query: PropertyQuery) => ["properties", "browse", query] as const,
    detail: (id: string) => ["properties", "detail", id] as const,
    mine: ["properties", "mine"] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    detail: (id: string) => ["bookings", "detail", id] as const,
    blockedDates: (propertyId: string) => ["bookings", "blocked-dates", propertyId] as const,
  },
  users: {
    me: ["users", "me"] as const,
    stats: ["users", "stats"] as const,
  },
} as const;
