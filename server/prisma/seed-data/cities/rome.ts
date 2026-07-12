import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const romeProperties: SeedPropertyTemplate[] = [
  {
    title: "Trastevere Apartment with Rooftop",
    description:
      "Lose yourself in Rome's most charming neighbourhood. This bright apartment features original terracotta tiles, arched doorways and a shared rooftop terrace with views of the basilicas. Fall asleep to the sound of fountains beneath your window.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    country: "Italy",
    district: "Trastevere",
    street: "Via della Lungara",
    houseNumber: "15",
    latitude: 41.8919,
    longitude: 12.4692,
    pricePerNight: 145,
    maxGuests: 3,
    amenities: [
      Amenity.WIFI,
      Amenity.ROOFTOP_TERRACE,
      Amenity.KITCHEN,
      Amenity.AIR_CONDITIONING,
      Amenity.CITY_CENTRE,
    ],
    images: pickImages("historicEuropean", 5, 11),
    ownerEmail: "owner@demo.com",
    createdMonthsAgo: 28,
  },
  {
    title: "Historic Flat near the Colosseum",
    description:
      "Wake up with a view of the Colosseum from this beautifully restored 2-bedroom apartment. Original Roman stone arches in the living area, a full kitchen and a quiet rear-facing terrace for evening aperitivo.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    country: "Italy",
    district: "Centro Storico",
    street: "Via Sacra",
    houseNumber: "8",
    latitude: 41.8902,
    longitude: 12.4924,
    pricePerNight: 195,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.TERRACE, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING, Amenity.AIR_CONDITIONING],
    images: pickImages("historicEuropean", 5, 6),
    ownerEmail: "owner2@demo.com",
    createdMonthsAgo: 6,
  },
];
