import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const tokyoProperties: SeedPropertyTemplate[] = [
  {
    title: "Minimalist Apartment in Shimokitazawa",
    description:
      "A quiet, tatami-free apartment in Shimokitazawa's tangle of vintage shops and live-music bars. Compact Japanese kitchen, a low platform bed, and a five-minute walk to the station.",
    type: PropertyType.APARTMENT,
    city: "Tokyo",
    country: "Japan",
    district: "Shimokitazawa",
    street: "Kitazawa",
    houseNumber: "2-14",
    latitude: 35.6613,
    longitude: 139.6683,
    pricePerNight: 128,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.AIR_CONDITIONING, Amenity.SMART_TV],
    images: pickImages("minimalistModern", 4, 1),
    ownerEmail: "haruto.sato@seedhost.dev",
    createdMonthsAgo: 16,
  },
  {
    title: "Traditional Machiya near Asakusa",
    description:
      "A narrow wooden machiya townhouse a short walk from Senso-ji temple in Asakusa. Sliding shoji doors, a small inner garden, and lantern-lit streets right outside once the sun goes down.",
    type: PropertyType.HOUSE,
    city: "Tokyo",
    country: "Japan",
    district: "Asakusa",
    street: "Kaminarimon",
    houseNumber: "3-4",
    latitude: 35.7118,
    longitude: 139.7967,
    pricePerNight: 210,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN, Amenity.AIR_CONDITIONING],
    images: pickImages("cabinCottage", 4, 2),
    ownerEmail: "yuki.tanaka@seedhost.dev",
    createdMonthsAgo: 38,
  },
];
