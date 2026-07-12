import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const istanbulProperties: SeedPropertyTemplate[] = [
  {
    title: "Bosphorus View Apartment in Cihangir",
    description:
      "A bohemian apartment in Cihangir with a sliver of Bosphorus visible between the rooftops. Antique shops and cat cafes downstairs, Galata Tower a fifteen-minute walk away.",
    type: PropertyType.APARTMENT,
    city: "Istanbul",
    country: "Turkey",
    district: "Cihangir",
    street: "Sıraselviler Caddesi",
    houseNumber: "60",
    latitude: 41.0328,
    longitude: 28.9836,
    pricePerNight: 46,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.SEA_VIEW, Amenity.KITCHEN, Amenity.CITY_CENTRE],
    images: pickImages("cityApartment", 4, 9),
    ownerEmail: "yusuf.demir@seedhost.dev",
    createdMonthsAgo: 21,
  },
  {
    title: "Ottoman House near the Grand Bazaar",
    description:
      "A restored wooden Ottoman house two alleys from the Grand Bazaar, with a small hamam-style bathroom and hand-painted ceiling details. Sultanahmet's mosques are an easy walk downhill.",
    type: PropertyType.HOUSE,
    city: "Istanbul",
    country: "Turkey",
    district: "Fatih",
    street: "Yeniceriler Caddesi",
    houseNumber: "18",
    latitude: 41.0107,
    longitude: 28.9646,
    pricePerNight: 58,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN, Amenity.BATHTUB],
    images: pickImages("historicEuropean", 4, 5),
    ownerEmail: "lukas.wagner@seedhost.dev",
    createdMonthsAgo: 9,
  },
];
