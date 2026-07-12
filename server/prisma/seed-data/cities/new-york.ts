import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const newYorkProperties: SeedPropertyTemplate[] = [
  {
    title: "Pre-War Apartment in the West Village",
    description:
      "A classic pre-war one-bedroom on a tree-lined West Village block, with original crown moulding and a working (decorative-only) fireplace. Jazz clubs and the Hudson River waterfront both a short walk away.",
    type: PropertyType.APARTMENT,
    city: "New York",
    country: "United States",
    district: "West Village",
    street: "Bedford Street",
    houseNumber: "75",
    apartment: "3B",
    latitude: 40.7318,
    longitude: -74.0046,
    pricePerNight: 285,
    maxGuests: 3,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.FIREPLACE, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING, Amenity.ELEVATOR],
    images: pickImages("historicEuropean", 4, 0),
    ownerEmail: "james.oconnor@seedhost.dev",
    createdMonthsAgo: 40,
  },
  {
    title: "Loft with Skyline View in Williamsburg",
    description:
      "A converted warehouse loft in Williamsburg with exposed ductwork, twelve-foot ceilings, and a rooftop shared with two other units looking straight at the Manhattan skyline.",
    type: PropertyType.APARTMENT,
    city: "New York",
    country: "United States",
    district: "Williamsburg",
    street: "Kent Avenue",
    houseNumber: "184",
    latitude: 40.7168,
    longitude: -73.9611,
    pricePerNight: 245,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.ROOFTOP_TERRACE, Amenity.SMART_TV, Amenity.KITCHEN, Amenity.WASHER],
    images: pickImages("loftIndustrial", 5, 1),
    ownerEmail: "amanda.johnson@seedhost.dev",
    createdMonthsAgo: 17,
  },
];
