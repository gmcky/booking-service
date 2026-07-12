import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const buenosAiresProperties: SeedPropertyTemplate[] = [
  {
    title: "Tango-District Apartment in San Telmo",
    description:
      "A high-ceilinged apartment above San Telmo's Sunday antiques market, with wrought-iron balconies and original checkerboard floor tiles. Tango dancers take over the corner plaza most evenings.",
    type: PropertyType.APARTMENT,
    city: "Buenos Aires",
    country: "Argentina",
    district: "San Telmo",
    street: "Defensa",
    houseNumber: "890",
    latitude: -34.6212,
    longitude: -58.3714,
    pricePerNight: 68,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.BALCONY, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN],
    images: pickImages("historicEuropean", 4, 13),
    ownerEmail: "ricardo.silva@seedhost.dev",
    createdMonthsAgo: 16,
  },
  {
    title: "Parisian-Style Flat in Recoleta",
    description:
      "A grand, mansard-roofed apartment in Recoleta, Buenos Aires's most European corner, a short walk from the famous cemetery and its marble mausoleums. Bookshelves line every wall.",
    type: PropertyType.APARTMENT,
    city: "Buenos Aires",
    country: "Argentina",
    district: "Recoleta",
    street: "Avenida Alvear",
    houseNumber: "1750",
    latitude: -34.5875,
    longitude: -58.3927,
    pricePerNight: 92,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.BOOKS, Amenity.KITCHEN, Amenity.ELEVATOR, Amenity.HISTORIC_BUILDING],
    images: pickImages("historicEuropean", 4, 10),
    ownerEmail: "priya.sharma@seedhost.dev",
    createdMonthsAgo: 28,
  },
];
