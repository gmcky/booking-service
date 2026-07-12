import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const parisProperties: SeedPropertyTemplate[] = [
  {
    title: "Charming Studio near the Eiffel Tower",
    description:
      "Ooh la la! A romantic studio for two in the 7th arrondissement, a short walk from the Eiffel Tower. French antique furniture, a Nespresso machine and a tiny balcony with iron railings — quintessentially Parisian.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    country: "France",
    district: "7th arrondissement",
    street: "Rue de Grenelle",
    houseNumber: "42",
    latitude: 48.8566,
    longitude: 2.3086,
    pricePerNight: 175,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.COFFEE_MACHINE,
      Amenity.BALCONY,
      Amenity.AIR_CONDITIONING,
      Amenity.CITY_CENTRE,
    ],
    images: pickImages("cityApartment", 5, 8),
    ownerEmail: "owner@demo.com",
    createdMonthsAgo: 24,
  },
  {
    title: "Haussmann Apartment in Le Marais",
    description:
      "A classic Haussmann building apartment in the heart of Le Marais — Paris's most fashionable neighbourhood. Two bedrooms, parquet floors, exposed stone walls and high ceilings. Steps from Place des Vosges.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    country: "France",
    district: "Le Marais",
    street: "Rue de Bretagne",
    houseNumber: "18",
    latitude: 48.8631,
    longitude: 2.3628,
    pricePerNight: 240,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.AIR_CONDITIONING,
      Amenity.DISHWASHER,
      Amenity.HISTORIC_BUILDING,
    ],
    images: pickImages("historicEuropean", 5, 9),
    ownerEmail: "owner2@demo.com",
    createdMonthsAgo: 17,
  },
];
