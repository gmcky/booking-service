import type { PropertyQuery } from "@/lib/api/properties";
import type { ReviewQuery } from "@/lib/api/reviews";
import type { FavoriteQuery } from "@/lib/api/favorites";
import type { HostReviewQuery } from "@/lib/api/users";

export const queryKeys = {
  properties: {
    all: ["properties"] as const,
    list: (query: PropertyQuery) => ["properties", "list", query] as const,
    browse: (query: PropertyQuery) => ["properties", "browse", query] as const,
    mapMarkers: (query: PropertyQuery) => ["properties", "map-markers", query] as const,
    detail: (id: string) => ["properties", "detail", id] as const,
    nearby: (propertyId: string, city: string, country: string) =>
      ["properties", "nearby", propertyId, city, country] as const,
    mine: ["properties", "mine"] as const,
    locations: ["properties", "locations"] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    detail: (id: string) => ["bookings", "detail", id] as const,
    host: (query: Record<string, unknown>) => ["bookings", "host", query] as const,
    hostDetail: (id: string) => ["bookings", "host-detail", id] as const,
    blockedDates: (propertyId: string) => ["bookings", "blocked-dates", propertyId] as const,
  },
  admin: {
    hostCancellations: (query: Record<string, unknown>) =>
      ["admin", "host-cancellations", query] as const,
    settings: ["admin", "settings"] as const,
  },
  users: {
    me: ["users", "me"] as const,
    stats: ["users", "stats"] as const,
    publicProfile: (id: string) => ["users", "public-profile", id] as const,
    hostReviews: (id: string, query: HostReviewQuery) =>
      ["users", "host-reviews", id, query] as const,
  },
  reviews: {
    list: (propertyId: string, query: ReviewQuery) =>
      ["reviews", "list", propertyId, query] as const,
    stats: (propertyId: string) => ["reviews", "stats", propertyId] as const,
  },
  favorites: {
    ids: ["favorites", "ids"] as const,
    list: (query: FavoriteQuery) => ["favorites", "list", query] as const,
  },
} as const;
