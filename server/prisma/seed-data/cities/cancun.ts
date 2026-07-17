import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const cancunProperties: SeedPropertyTemplate[] = [
  {
    title: "Beachfront Condo in the Hotel Zone",
    description:
      "A beachfront condo with a wraparound balcony over the turquoise water of the Hotel Zone. Infinity pool downstairs, powder-white sand steps from the lobby.",
    type: PropertyType.APARTMENT,
    city: "Cancún",
    country: "Mexico",
    district: "Zona Hotelera",
    street: "Boulevard Kukulcan",
    houseNumber: "9.5",
    apartment: "1204",
    latitude: 21.1194,
    longitude: -86.7593,
    pricePerNight: 245,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.BEACHFRONT, Amenity.SEA_VIEW, Amenity.AIR_CONDITIONING, Amenity.BALCONY],
    images: pickImages("beach", 5, 6),
    ownerEmail: "santiago.gomez@seedhost.dev",
    createdMonthsAgo: 11,
  },
  {
    title: "Jungle-Edge Villa near Puerto Juarez",
    description:
      "A quieter alternative to the strip: a villa backing onto mangrove jungle near Puerto Juarez, with its own pool and a hammock-strung palapa. Ferry to Isla Mujeres ten minutes away.",
    type: PropertyType.HOUSE,
    city: "Cancún",
    country: "Mexico",
    district: "Puerto Juarez",
    street: "Avenida Lopez Portillo",
    houseNumber: "44",
    latitude: 21.1685,
    longitude: -86.8134,
    pricePerNight: 175,
    maxGuests: 6,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.GARDEN, Amenity.PARKING, Amenity.AIR_CONDITIONING],
    images: pickImages("tropical", 4, 3),
    ownerEmail: "valentina.rojas@seedhost.dev",
    createdMonthsAgo: 6,
  },
];
