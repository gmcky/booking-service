import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const rioDeJaneiroProperties: SeedPropertyTemplate[] = [
  {
    title: "Beachfront Apartment in Ipanema",
    description:
      "A breezy apartment two blocks from Ipanema beach, with Sugarloaf Mountain visible from the balcony on a clear morning. Caipirinha stands and the Sunday hippie market both nearby.",
    type: PropertyType.APARTMENT,
    city: "Rio de Janeiro",
    country: "Brazil",
    district: "Ipanema",
    street: "Rua Visconde de Piraja",
    houseNumber: "270",
    latitude: -22.9838,
    longitude: -43.2075,
    pricePerNight: 105,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.BALCONY, Amenity.SEA_VIEW, Amenity.AIR_CONDITIONING, Amenity.BEACHFRONT],
    images: pickImages("beach", 4, 9),
    ownerEmail: "santiago.gomez@seedhost.dev",
    createdMonthsAgo: 24,
  },
  {
    title: "Hillside House with Pool in Santa Teresa",
    description:
      "A bohemian hillside house in cobblestoned Santa Teresa, with a small pool overlooking the bay and the old tram line running past the gate. Artists' studios and samba bars fill the surrounding streets.",
    type: PropertyType.HOUSE,
    city: "Rio de Janeiro",
    country: "Brazil",
    district: "Santa Teresa",
    street: "Rua Almirante Alexandrino",
    houseNumber: "398",
    latitude: -22.9167,
    longitude: -43.1897,
    pricePerNight: 130,
    maxGuests: 5,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.GARDEN, Amenity.TERRACE, Amenity.KITCHEN],
    images: pickImages("villaPool", 4, 4),
    ownerEmail: "ricardo.silva@seedhost.dev",
    createdMonthsAgo: 35,
  },
];
