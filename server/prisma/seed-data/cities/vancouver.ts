import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const vancouverProperties: SeedPropertyTemplate[] = [
  {
    title: "Seawall Apartment in Yaletown",
    description:
      "A glass-tower apartment steps from the Yaletown seawall, with a view over False Creek to the North Shore mountains on a clear day. Kayaks for rent right at the marina below.",
    type: PropertyType.APARTMENT,
    city: "Vancouver",
    country: "Canada",
    district: "Yaletown",
    street: "Homer Street",
    houseNumber: "1055",
    apartment: "22-04",
    latitude: 49.2757,
    longitude: -123.121,
    pricePerNight: 165,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.GYM, Amenity.SEA_VIEW, Amenity.ELEVATOR, Amenity.SMART_TV],
    images: pickImages("minimalistModern", 4, 3),
    ownerEmail: "michael.chen@seedhost.dev",
    createdMonthsAgo: 19,
  },
  {
    title: "Craftsman House near Commercial Drive",
    description:
      "A restored 1910s craftsman house on Commercial Drive, with a wraparound porch and a small backyard for morning coffee. Independent cafes and bakeries within a five-minute walk.",
    type: PropertyType.HOUSE,
    city: "Vancouver",
    country: "Canada",
    district: "Grandview-Woodland",
    street: "Salsbury Drive",
    houseNumber: "1742",
    latitude: 49.2712,
    longitude: -123.0692,
    pricePerNight: 140,
    maxGuests: 5,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.KITCHEN, Amenity.WASHER, Amenity.PARKING],
    images: pickImages("cityApartment", 4, 3),
    ownerEmail: "olivia.taylor@seedhost.dev",
    createdMonthsAgo: 22,
  },
];
