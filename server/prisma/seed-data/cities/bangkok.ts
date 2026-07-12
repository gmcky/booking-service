import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const bangkokProperties: SeedPropertyTemplate[] = [
  {
    title: "Riverside Condo near Chao Phraya",
    description:
      "A high-floor condo with a river view over the Chao Phraya, an easy walk to the Saphan Taksin BTS station and the ferry piers. Rooftop pool downstairs, night market food stalls a few blocks over.",
    type: PropertyType.APARTMENT,
    city: "Bangkok",
    country: "Thailand",
    district: "Sathorn",
    street: "Charoen Krung",
    houseNumber: "2/14",
    latitude: 13.7196,
    longitude: 100.5142,
    pricePerNight: 42,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.RIVER_VIEW, Amenity.AIR_CONDITIONING, Amenity.ELEVATOR],
    images: pickImages("tropical", 4, 0),
    ownerEmail: "siriporn.charoen@seedhost.dev",
    createdMonthsAgo: 10,
  },
  {
    title: "Backpacker Room off Khao San Road",
    description:
      "A simple private room one street back from the Khao San Road chaos — close enough to walk to everything, far enough to actually sleep. Shared kitchen downstairs, rooftop hangout for guests.",
    type: PropertyType.HOTEL_ROOM,
    city: "Bangkok",
    country: "Thailand",
    district: "Banglamphu",
    street: "Soi Rambuttri",
    houseNumber: "15",
    latitude: 13.7593,
    longitude: 100.4977,
    pricePerNight: 15,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.AIR_CONDITIONING, Amenity.ROOFTOP_TERRACE],
    images: pickImages("compactRoom", 4, 8),
    ownerEmail: "jonas.becker@seedhost.dev",
    createdMonthsAgo: 6,
  },
];
