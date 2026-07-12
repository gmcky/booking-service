import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const dubrovnikProperties: SeedPropertyTemplate[] = [
  {
    title: "Stone House inside the Old Town Walls",
    description:
      "A restored stone house on a stepped alley inside Dubrovnik's fortified Old Town, minutes from the Stradun and the cable car up to Mount Srd. Thick walls keep it cool even in August.",
    type: PropertyType.HOUSE,
    city: "Dubrovnik",
    country: "Croatia",
    district: "Old Town",
    street: "Prijeko",
    houseNumber: "9",
    latitude: 42.6426,
    longitude: 18.1099,
    pricePerNight: 128,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.AIR_CONDITIONING, Amenity.HISTORIC_BUILDING, Amenity.CITY_CENTRE],
    images: pickImages("historicEuropean", 4, 14),
    ownerEmail: "milos.jovanovic@seedhost.dev",
    createdMonthsAgo: 24,
  },
  {
    title: "Waterfront Apartment near Banje Beach",
    description:
      "A sea-facing apartment a short walk from Banje Beach, with the Old Town walls visible from the balcony. Sunrise swims before the day-trip crowds arrive, then an easy stroll into town for dinner.",
    type: PropertyType.APARTMENT,
    city: "Dubrovnik",
    country: "Croatia",
    district: "Ploce",
    street: "Frana Supila",
    houseNumber: "14",
    latitude: 42.6407,
    longitude: 18.1183,
    pricePerNight: 140,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.SEA_VIEW, Amenity.BALCONY, Amenity.AIR_CONDITIONING, Amenity.BEACHFRONT],
    images: pickImages("beach", 4, 5),
    ownerEmail: "petra.horvat@seedhost.dev",
    createdMonthsAgo: 24,
  },
];
