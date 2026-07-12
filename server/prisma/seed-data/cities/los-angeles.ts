import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const losAngelesProperties: SeedPropertyTemplate[] = [
  {
    title: "Mid-Century Bungalow in Silver Lake",
    description:
      "A single-storey mid-century bungalow with a private patio and a hammock strung between two palms, a short drive from the Silver Lake reservoir. Record player included, naturally.",
    type: PropertyType.HOUSE,
    city: "Los Angeles",
    country: "United States",
    district: "Silver Lake",
    street: "Micheltorena Street",
    houseNumber: "1420",
    latitude: 34.0868,
    longitude: -118.281,
    pricePerNight: 195,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.PARKING, Amenity.VINYL_RECORD_PLAYER, Amenity.KITCHEN, Amenity.GARDEN],
    images: pickImages("cabinCottage", 4, 1),
    ownerEmail: "amanda.johnson@seedhost.dev",
    createdMonthsAgo: 26,
  },
  {
    title: "Poolside Guesthouse in Venice",
    description:
      "A detached guesthouse behind a bigger property, three blocks from the Venice boardwalk. Small private pool shared with the main house, bikes leaned against the fence for guests to borrow.",
    type: PropertyType.HOUSE,
    city: "Los Angeles",
    country: "United States",
    district: "Venice",
    street: "Ocean Front Walk",
    houseNumber: "225",
    latitude: 33.985,
    longitude: -118.4713,
    pricePerNight: 230,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.BIKE_INCLUDED, Amenity.BEACHFRONT, Amenity.AIR_CONDITIONING],
    images: pickImages("villaPool", 4, 6),
    ownerEmail: "olivia.taylor@seedhost.dev",
    createdMonthsAgo: 8,
  },
];
