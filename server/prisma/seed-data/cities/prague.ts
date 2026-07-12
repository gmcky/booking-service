import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const pragueProperties: SeedPropertyTemplate[] = [
  {
    title: "Baroque Apartment below Prague Castle",
    description:
      "A vaulted-ceiling apartment on a cobbled Mala Strana street, in the shadow of Prague Castle. Original wooden shutters, a tiny wine cellar turned pantry, and a five-minute walk across Charles Bridge into the Old Town.",
    type: PropertyType.APARTMENT,
    city: "Prague",
    country: "Czechia",
    district: "Mala Strana",
    street: "Nerudova",
    houseNumber: "27",
    latitude: 50.0894,
    longitude: 14.4009,
    pricePerNight: 84,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN, Amenity.CITY_CENTRE],
    images: pickImages("historicEuropean", 4, 8),
    ownerEmail: "tomas.novak@seedhost.dev",
    createdMonthsAgo: 17,
  },
  {
    title: "Riverside Studio in Karlin",
    description:
      "A quiet, freshly renovated studio in up-and-coming Karlin, across the river from the tourist crowds. Craft breweries and a Sunday farmers market are both a short walk away.",
    type: PropertyType.APARTMENT,
    city: "Prague",
    country: "Czechia",
    district: "Karlin",
    street: "Krizikova",
    houseNumber: "52",
    latitude: 50.0935,
    longitude: 14.4453,
    pricePerNight: 62,
    maxGuests: 2,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.WASHER, Amenity.AIR_CONDITIONING],
    images: pickImages("minimalistModern", 4, 15),
    ownerEmail: "zofia.kaminska@seedhost.dev",
    createdMonthsAgo: 5,
  },
];
