import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const ubudProperties: SeedPropertyTemplate[] = [
  {
    title: "Rice Field Villa with Private Pool",
    description:
      "An open-plan villa overlooking a working rice terrace, with a private plunge pool and a thatched bale for morning yoga. Roosters double as the alarm clock. Ubud's monkey forest is a ten-minute scooter ride away.",
    type: PropertyType.HOUSE,
    city: "Ubud",
    country: "Indonesia",
    district: "Tegallalang",
    street: "Jalan Raya Tegallalang",
    houseNumber: "22",
    latitude: 8.4305,
    longitude: 115.2793,
    pricePerNight: 95,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.GARDEN, Amenity.KITCHEN, Amenity.TERRACE],
    images: pickImages("tropical", 5, 4),
    ownerEmail: "made.wirawan@seedhost.dev",
    createdMonthsAgo: 18,
  },
  {
    title: "Jungle Bungalow near Campuhan Ridge",
    description:
      "A single wooden bungalow on stilts above a ravine, five minutes' walk from the Campuhan Ridge trailhead. Open-air bathroom, mosquito net over the bed, and a soundtrack of cicadas all night.",
    type: PropertyType.HOUSE,
    city: "Ubud",
    country: "Indonesia",
    district: "Campuhan",
    street: "Jalan Bisma",
    houseNumber: "11",
    latitude: 8.5119,
    longitude: 115.2551,
    pricePerNight: 48,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.TERRACE],
    images: pickImages("tropical", 4, 7),
    ownerEmail: "made.wirawan@seedhost.dev",
    createdMonthsAgo: 5,
  },
];
