import { BASE_URL } from "./client";
import { useAuthStore } from "@/lib/auth/store";

export type PropertyType = "HOTEL_ROOM" | "APARTMENT" | "HOUSE" | "MEETING_ROOM";

export type PropertySort = "price_asc" | "price_desc" | "newest";

export interface PropertyOwner {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  address: string;
  pricePerNight: string;
  maxGuests: number;
  amenities: string[];
  images: string[];
  ownerId: string;
  isActive: boolean;
  averageRating: string | null;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  owner: PropertyOwner;
}

export interface PropertyReview {
  id: string;
  rating: number;
  comment: string | null;
  hostReplyText: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string };
  hostReplyBy: { firstName: string; lastName: string } | null;
}

export type PropertyDetail = Property & { reviews: PropertyReview[] };

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PropertyQuery {
  city?: string;
  type?: PropertyType;
  amenities?: string[];
  minPrice?: number;
  maxPrice?: number;
  maxGuests?: number;
  sort?: PropertySort;
  page?: number;
  limit?: number;
  checkIn?: string;
  checkOut?: string;
}

function buildQuery(query: PropertyQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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

const get = <T>(path: string) => request<T>("GET", path);

export type HostProperty = Omit<Property, "owner">;

export interface CreatePropertyInput {
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  address: string;
  pricePerNight: number;
  maxGuests: number;
  amenities: string[];
}

export const propertyApi = {
  search: (query: PropertyQuery = {}) =>
    get<Paginated<Property>>(`/properties${buildQuery(query)}`),

  byId: (id: string) => get<PropertyDetail>(`/properties/${id}`),

  mine: () => get<Paginated<HostProperty>>("/properties/my"),

  create: (input: CreatePropertyInput) =>
    request<HostProperty>("POST", "/properties", { ...input, rawImagePaths: [] }),

  setActive: (id: string, active: boolean) =>
    request<HostProperty>("POST", `/properties/${id}/${active ? "activate" : "deactivate"}`),

  remove: (id: string) => request<unknown>("DELETE", `/properties/${id}`),
};

const wholePriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(value: string | number): string {
  const amount = Number(value);
  return Number.isInteger(amount)
    ? wholePriceFormatter.format(amount)
    : centPriceFormatter.format(amount);
}

export function formatRating(value: string | null): string | null {
  return value === null ? null : Number(value).toFixed(2);
}

export function amenityLabel(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const TYPE_LABELS: Record<PropertyType, string> = {
  HOTEL_ROOM: "Hotel room",
  APARTMENT: "Apartment",
  HOUSE: "House",
  MEETING_ROOM: "Meeting room",
};

export function typeLabel(value: PropertyType): string {
  return TYPE_LABELS[value];
}

