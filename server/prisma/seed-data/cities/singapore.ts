import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const singaporeProperties: SeedPropertyTemplate[] = [
  {
    title: "Shophouse Apartment in Tiong Bahru",
    description:
      "A restored art-deco shophouse unit in Tiong Bahru, Singapore's most photogenic old neighbourhood. Independent coffee shops and a famous hawker centre are both a short walk away.",
    type: PropertyType.APARTMENT,
    city: "Singapore",
    country: "Singapore",
    district: "Tiong Bahru",
    street: "Yong Siak Street",
    houseNumber: "78",
    latitude: 1.2847,
    longitude: 103.8281,
    pricePerNight: 165,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.AIR_CONDITIONING, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING],
    images: pickImages("cityApartment", 4, 14),
    ownerEmail: "wei.zhang@seedhost.dev",
    createdMonthsAgo: 9,
  },
  {
    title: "High-Rise Studio with Marina View",
    description:
      "A sleek studio on the 32nd floor with the Marina Bay skyline lit up outside the window every night. Building pool and gym included, MRT station two minutes downstairs.",
    type: PropertyType.APARTMENT,
    city: "Singapore",
    country: "Singapore",
    district: "Marina Bay",
    street: "Marina Boulevard",
    houseNumber: "18",
    apartment: "32-02",
    latitude: 1.2807,
    longitude: 103.8547,
    pricePerNight: 220,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.GYM, Amenity.SMART_TV, Amenity.AIR_CONDITIONING, Amenity.ELEVATOR],
    images: pickImages("minimalistModern", 5, 2),
    ownerEmail: "michael.chen@seedhost.dev",
    createdMonthsAgo: 25,
  },
];
