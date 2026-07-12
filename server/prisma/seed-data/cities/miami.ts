import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const miamiProperties: SeedPropertyTemplate[] = [
  {
    title: "Art Deco Studio on Ocean Drive",
    description:
      "A pastel art-deco studio a block from Ocean Drive, in a restored 1930s building with a terrazzo lobby. South Beach nightlife right outside, quieter than it sounds once the door closes.",
    type: PropertyType.APARTMENT,
    city: "Miami",
    country: "United States",
    district: "South Beach",
    street: "Ocean Drive",
    houseNumber: "960",
    latitude: 25.7907,
    longitude: -80.13,
    pricePerNight: 210,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.AIR_CONDITIONING, Amenity.BEACHFRONT, Amenity.HISTORIC_BUILDING],
    images: pickImages("beach", 4, 8),
    ownerEmail: "carlos.mendoza@seedhost.dev",
    createdMonthsAgo: 14,
  },
  {
    title: "Waterfront Villa with Private Dock",
    description:
      "A modern villa on a Biscayne Bay canal with a private dock and a heated pool overlooking the water. Floor-to-ceiling glass throughout, built for entertaining as much as relaxing.",
    type: PropertyType.HOUSE,
    city: "Miami",
    country: "United States",
    district: "Coconut Grove",
    street: "Kumquat Avenue",
    houseNumber: "3311",
    latitude: 25.7279,
    longitude: -80.2436,
    pricePerNight: 420,
    maxGuests: 8,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.PARKING, Amenity.AIR_CONDITIONING, Amenity.SMART_TV, Amenity.BBQ],
    images: pickImages("villaPool", 5, 3),
    ownerEmail: "pieter.devries@seedhost.dev",
    createdMonthsAgo: 31,
  },
];
