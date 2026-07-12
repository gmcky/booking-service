import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const londonProperties: SeedPropertyTemplate[] = [
  {
    title: "Georgian Townhouse Flat in Notting Hill",
    description:
      "A first-floor flat in a pastel-painted Georgian terrace near Portobello Road. High ceilings, a working fireplace and sash windows overlooking a quiet garden square. Saturday market is a five-minute stroll.",
    type: PropertyType.APARTMENT,
    city: "London",
    country: "United Kingdom",
    district: "Notting Hill",
    street: "Elgin Crescent",
    houseNumber: "37",
    latitude: 51.5155,
    longitude: -0.2035,
    pricePerNight: 195,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.FIREPLACE, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING, Amenity.GARDEN],
    images: pickImages("historicEuropean", 5, 3),
    ownerEmail: "james.oconnor@seedhost.dev",
    createdMonthsAgo: 34,
  },
  {
    title: "Riverside Apartment near Tower Bridge",
    description:
      "Floor-to-ceiling windows frame Tower Bridge from the living room of this modern riverside apartment. Concierge building, gym on-site, and a five-minute walk to Borough Market for weekend breakfasts.",
    type: PropertyType.APARTMENT,
    city: "London",
    country: "United Kingdom",
    district: "Southwark",
    street: "Shad Thames",
    houseNumber: "9",
    apartment: "14",
    latitude: 51.5033,
    longitude: -0.0777,
    pricePerNight: 260,
    maxGuests: 4,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.GYM, Amenity.RIVER_VIEW, Amenity.ELEVATOR, Amenity.SMART_TV, Amenity.AIR_CONDITIONING],
    images: pickImages("minimalistModern", 5, 13),
    ownerEmail: "james.oconnor@seedhost.dev",
    createdMonthsAgo: 21,
  },
];
