import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const mexicoCityProperties: SeedPropertyTemplate[] = [
  {
    title: "Art Nouveau Flat in Roma Norte",
    description:
      "A high-ceilinged flat in a restored art nouveau building on a jacaranda-lined street in Roma Norte. Third-wave coffee shops and taquerias are both within a five-minute walk.",
    type: PropertyType.APARTMENT,
    city: "Mexico City",
    country: "Mexico",
    district: "Roma Norte",
    street: "Alvaro Obregon",
    houseNumber: "137",
    latitude: 19.4173,
    longitude: -99.163,
    pricePerNight: 52,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.BALCONY, Amenity.HISTORIC_BUILDING],
    images: pickImages("historicEuropean", 4, 15),
    ownerEmail: "valentina.rojas@seedhost.dev",
    createdMonthsAgo: 12,
  },
  {
    title: "Garden Casita in Coyoacan",
    description:
      "A single-room casita in a shared garden compound near Frida Kahlo's Casa Azul in Coyoacan. Cobblestone streets, mariachi on weekends in the plaza, and genuinely good street food nearby.",
    type: PropertyType.HOUSE,
    city: "Mexico City",
    country: "Mexico",
    district: "Coyoacan",
    street: "Francisco Sosa",
    houseNumber: "12",
    latitude: 19.3467,
    longitude: -99.1621,
    pricePerNight: 34,
    maxGuests: 2,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.KITCHEN],
    images: pickImages("cabinCottage", 4, 4),
    ownerEmail: "carlos.mendoza@seedhost.dev",
    createdMonthsAgo: 20,
  },
];
