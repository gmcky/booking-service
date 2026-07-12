import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const seoulProperties: SeedPropertyTemplate[] = [
  {
    title: "Hanok Courtyard House in Bukchon",
    description:
      "A traditional hanok with a small central courtyard in Bukchon village, wedged between two palaces. Heated floors in winter, sliding paper doors, and rooftop tiles you can see from every room.",
    type: PropertyType.HOUSE,
    city: "Seoul",
    country: "South Korea",
    district: "Bukchon",
    street: "Gahoe-ro",
    houseNumber: "31",
    latitude: 37.5825,
    longitude: 126.9837,
    pricePerNight: 88,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.COURTYARD, Amenity.HEATING, Amenity.HISTORIC_BUILDING],
    images: pickImages("cabinCottage", 4, 8),
    ownerEmail: "ji-woo.kim@seedhost.dev",
    createdMonthsAgo: 13,
  },
  {
    title: "High-Floor Apartment in Hongdae",
    description:
      "A compact, well-designed apartment above Hongdae's late-night streets, close to the university and the indie music clubs. Smart TV, good soundproofing, and a 24-hour convenience store downstairs.",
    type: PropertyType.APARTMENT,
    city: "Seoul",
    country: "South Korea",
    district: "Hongdae",
    street: "Wausan-ro",
    houseNumber: "17",
    latitude: 37.5533,
    longitude: 126.9226,
    pricePerNight: 68,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.SMART_TV, Amenity.AIR_CONDITIONING, Amenity.ELEVATOR],
    images: pickImages("minimalistModern", 4, 7),
    ownerEmail: "ji-woo.kim@seedhost.dev",
    createdMonthsAgo: 4,
  },
];
