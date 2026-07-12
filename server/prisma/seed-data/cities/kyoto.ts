import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const kyotoProperties: SeedPropertyTemplate[] = [
  {
    title: "Restored Machiya near Gion",
    description:
      "A century-old machiya restored beam by beam, tucked behind Gion's geisha district. Tatami rooms downstairs, a small tsuboniwa courtyard garden, and Yasaka Shrine ten minutes away on foot.",
    type: PropertyType.HOUSE,
    city: "Kyoto",
    country: "Japan",
    district: "Gion",
    street: "Hanamikoji",
    houseNumber: "4",
    latitude: 35.0037,
    longitude: 135.7756,
    pricePerNight: 195,
    maxGuests: 4,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.COURTYARD, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN],
    images: pickImages("cabinCottage", 4, 5),
    ownerEmail: "yuki.tanaka@seedhost.dev",
    createdMonthsAgo: 44,
  },
  {
    title: "Bamboo Grove View Studio, Arashiyama",
    description:
      "A small, quiet studio a walking distance from the Arashiyama bamboo grove, far enough from central Kyoto to hear the wind in the leaves at night. Simple futon bedding and a low kotatsu table.",
    type: PropertyType.APARTMENT,
    city: "Kyoto",
    country: "Japan",
    district: "Arashiyama",
    street: "Saga Tenryuji",
    houseNumber: "68",
    latitude: 35.0094,
    longitude: 135.6674,
    pricePerNight: 140,
    maxGuests: 2,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.GARDEN],
    images: pickImages("compactRoom", 4, 6),
    ownerEmail: "haruto.sato@seedhost.dev",
    createdMonthsAgo: 7,
  },
];
