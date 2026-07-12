import type { PropertyType, Amenity } from "@prisma/client";

export type SeedHost = {
  email: string;
  firstName: string;
  lastName: string;
  bio: string;
  avatarUrl?: string;
  /** Years before "now" the host account was created. */
  createdYearsAgo: number;
};

export type SeedGuest = {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  /** Months before "now" the guest account was created. */
  createdMonthsAgo: number;
};

export type SeedPropertyTemplate = {
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  country: string;
  district?: string;
  street: string;
  houseNumber?: string;
  apartment?: string;
  latitude: number;
  longitude: number;
  pricePerNight: number;
  maxGuests: number;
  petsAllowed?: boolean;
  infantsAllowed?: boolean;
  amenities: Amenity[];
  images: string[];
  ownerEmail: string;
  /** Months before "now" the listing was created. */
  createdMonthsAgo: number;
};

export type ReviewBucket = 5 | 4 | 3;

export type SeedReview = {
  text: string;
  bucket: ReviewBucket;
};

export type HostReplyTemplate = {
  text: string;
  /** Whether this reply reads as addressing a nitpick vs. plain thanks. */
  tone: "thanks" | "nitpick";
};
