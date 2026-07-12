import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const marrakeshProperties: SeedPropertyTemplate[] = [
  {
    title: "Traditional Riad in the Medina",
    description:
      "A restored riad hidden behind an unmarked door in the medina, built around a tiled courtyard with an orange tree and a small plunge pool. Rooftop terrace catches the call to prayer at sunset.",
    type: PropertyType.HOUSE,
    city: "Marrakesh",
    country: "Morocco",
    district: "Medina",
    street: "Derb Dabachi",
    houseNumber: "22",
    latitude: 31.6295,
    longitude: -7.9856,
    pricePerNight: 68,
    maxGuests: 6,
    amenities: [Amenity.WIFI, Amenity.COURTYARD, Amenity.POOL, Amenity.ROOFTOP_TERRACE, Amenity.GARDEN],
    images: pickImages("riadOriental", 4, 0),
    ownerEmail: "omar.idrissi@seedhost.dev",
    createdMonthsAgo: 25,
  },
  {
    title: "Rooftop Studio near Jemaa el-Fnaa",
    description:
      "A small studio one floor up from the souks, with a private rooftop nook overlooking the rooftops toward Jemaa el-Fnaa. The call of vendors drifts up from the alley below all day.",
    type: PropertyType.APARTMENT,
    city: "Marrakesh",
    country: "Morocco",
    district: "Medina",
    street: "Riad Zitoun Lakdim",
    houseNumber: "9",
    latitude: 31.6224,
    longitude: -7.9862,
    pricePerNight: 28,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.ROOFTOP_TERRACE, Amenity.KITCHEN],
    images: pickImages("riadOriental", 4, 3),
    ownerEmail: "anna.schmidt@seedhost.dev",
    createdMonthsAgo: 6,
  },
];
