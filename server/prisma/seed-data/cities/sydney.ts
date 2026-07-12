import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const sydneyProperties: SeedPropertyTemplate[] = [
  {
    title: "Harbourside Apartment in The Rocks",
    description:
      "A stone-walled apartment in The Rocks with the Harbour Bridge framed in the kitchen window. Cobbled lanes, weekend markets, and the Opera House all within a fifteen-minute walk.",
    type: PropertyType.APARTMENT,
    city: "Sydney",
    country: "Australia",
    district: "The Rocks",
    street: "George Street",
    houseNumber: "88",
    latitude: -33.8599,
    longitude: 151.2073,
    pricePerNight: 220,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.SEA_VIEW, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING, Amenity.AIR_CONDITIONING],
    images: pickImages("historicEuropean", 4, 1),
    ownerEmail: "olivia.taylor@seedhost.dev",
    createdMonthsAgo: 27,
  },
  {
    title: "Beach House in Bondi",
    description:
      "A weatherboard beach house two minutes' walk from Bondi's promenade, with a small deck for watching the sunrise surfers. Board storage in the hallway, saltwater smell everywhere.",
    type: PropertyType.HOUSE,
    city: "Sydney",
    country: "Australia",
    district: "Bondi Beach",
    street: "Campbell Parade",
    houseNumber: "142",
    latitude: -33.891,
    longitude: 151.2757,
    pricePerNight: 250,
    maxGuests: 5,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.BEACHFRONT, Amenity.TERRACE, Amenity.KITCHEN, Amenity.PARKING],
    images: pickImages("beach", 4, 2),
    ownerEmail: "thabo.nkosi@seedhost.dev",
    createdMonthsAgo: 9,
  },
];
