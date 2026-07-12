import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const dubaiProperties: SeedPropertyTemplate[] = [
  {
    title: "Marina Tower Apartment with Skyline View",
    description:
      "A high-floor apartment in a Dubai Marina tower with floor-to-ceiling windows facing the yacht-lined waterfront. Building pool and gym included, tram stop right outside.",
    type: PropertyType.APARTMENT,
    city: "Dubai",
    country: "United Arab Emirates",
    district: "Dubai Marina",
    street: "Marina Walk",
    houseNumber: "12",
    apartment: "45-01",
    latitude: 25.0805,
    longitude: 55.1403,
    pricePerNight: 240,
    maxGuests: 4,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.GYM, Amenity.AIR_CONDITIONING, Amenity.SMART_TV, Amenity.ELEVATOR],
    images: pickImages("minimalistModern", 5, 8),
    ownerEmail: "amir.al-sayed@seedhost.dev",
    createdMonthsAgo: 15,
  },
  {
    title: "Private Pool Villa in Jumeirah",
    description:
      "A walled villa two streets from Jumeirah Beach, with its own pool and a shaded outdoor majlis for evening tea. Quiet residential pocket, five minutes' drive from Dubai Mall.",
    type: PropertyType.HOUSE,
    city: "Dubai",
    country: "United Arab Emirates",
    district: "Jumeirah",
    street: "Al Wasl Road",
    houseNumber: "27",
    latitude: 25.2137,
    longitude: 55.2506,
    pricePerNight: 380,
    maxGuests: 8,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.PARKING, Amenity.AIR_CONDITIONING, Amenity.GARDEN, Amenity.BBQ],
    images: pickImages("villaPool", 5, 7),
    ownerEmail: "nadia.hassan@seedhost.dev",
    createdMonthsAgo: 29,
  },
];
