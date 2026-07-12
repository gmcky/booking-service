import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { imageUrl } from "../images.js";

// Hand-assigned: the canalBoat pool is too small for two listings' worth of
// disjoint picks, so each listing mixes canal shots with fitting interiors.
const canalHouseImages = [
  "1534351590666-13e3e96b5017", // canal hero
  "1513694203232-719a280e022f",
  "1583847268964-b28dc8f51f92",
  "1615529182904-14819c35db37",
  "1512470876302-972faa2aa9a4",
].map(imageUrl);

const houseboatImages = [
  "1567899378494-47b22a2ae96a", // moored boat hero
  "1533090161767-e6ffed986c88",
  "1616486338812-3dadae4b4ace",
  "1600607687920-4e2a09cf159d",
].map(imageUrl);

export const amsterdamProperties: SeedPropertyTemplate[] = [
  {
    title: "Canal House Apartment, Jordaan",
    description:
      "Live like a local in a narrow Dutch canal house in the Jordaan — Amsterdam's most picturesque neighbourhood. Original wooden beams, a steep canal-house staircase and a private terrace overlooking the Prinsengracht canal.",
    type: PropertyType.APARTMENT,
    city: "Amsterdam",
    country: "Netherlands",
    district: "Jordaan",
    street: "Prinsengracht",
    houseNumber: "204",
    latitude: 52.3745,
    longitude: 4.8836,
    pricePerNight: 210,
    maxGuests: 2,
    amenities: [Amenity.WIFI, Amenity.TERRACE, Amenity.CANAL_VIEW, Amenity.KITCHEN, Amenity.BIKE_INCLUDED],
    images: canalHouseImages,
    ownerEmail: "owner@demo.com",
    createdMonthsAgo: 21,
  },
  {
    title: "Modern Houseboat on the IJ",
    description:
      "An innovative stay — a fully renovated houseboat moored on the IJ river with stunning views of Amsterdam's skyline. Two bedrooms, a sun deck and a kayak available for guests. Unique, unforgettable, quintessentially Amsterdam.",
    type: PropertyType.HOUSE,
    city: "Amsterdam",
    country: "Netherlands",
    district: "Noord",
    street: "NDSM Wharf",
    latitude: 52.4009,
    longitude: 4.8951,
    pricePerNight: 230,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.SUN_DECK,
      Amenity.KAYAK,
      Amenity.KITCHEN,
      Amenity.RIVER_VIEW,
      Amenity.PARKING,
    ],
    images: houseboatImages,
    ownerEmail: "owner2@demo.com",
    createdMonthsAgo: 10,
  },
];
