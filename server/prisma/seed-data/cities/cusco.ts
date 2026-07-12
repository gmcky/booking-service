import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const cuscoProperties: SeedPropertyTemplate[] = [
  {
    title: "Colonial Courtyard House near Plaza de Armas",
    description:
      "A whitewashed colonial house built on Inca stone foundations, two blocks from the Plaza de Armas. Thick walls keep the altitude chill out, and the courtyard catches the afternoon sun.",
    type: PropertyType.HOUSE,
    city: "Cusco",
    country: "Peru",
    district: "Centro Historico",
    street: "Calle Suecia",
    houseNumber: "310",
    latitude: -13.517,
    longitude: -71.9787,
    pricePerNight: 42,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.COURTYARD, Amenity.HEATING, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN],
    images: pickImages("historicEuropean", 4, 3),
    ownerEmail: "priya.sharma@seedhost.dev",
    createdMonthsAgo: 20,
  },
  {
    title: "Mountain View Room in San Blas",
    description:
      "A simple private room in the artisan district of San Blas, up a steep cobbled hill with rooftop views over the city and the surrounding peaks. Coca tea in the kitchen for altitude sickness.",
    type: PropertyType.HOTEL_ROOM,
    city: "Cusco",
    country: "Peru",
    district: "San Blas",
    street: "Cuesta San Blas",
    houseNumber: "8",
    latitude: -13.5175,
    longitude: -71.9762,
    pricePerNight: 18,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.HEATING, Amenity.PRIVATE_BATHROOM],
    images: pickImages("compactRoom", 4, 1),
    ownerEmail: "santiago.gomez@seedhost.dev",
    createdMonthsAgo: 7,
  },
];
