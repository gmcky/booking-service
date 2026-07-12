import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const santoriniProperties: SeedPropertyTemplate[] = [
  {
    title: "Caldera-View Cave House in Oia",
    description:
      "A whitewashed cave house carved into the cliff, with an infinity-edge plunge pool staring straight at the caldera and the famous Oia sunset. Domed ceilings keep it cool through the afternoon heat.",
    type: PropertyType.HOUSE,
    city: "Santorini",
    country: "Greece",
    district: "Oia",
    street: "Agiou Ioannou",
    houseNumber: "3",
    latitude: 36.4614,
    longitude: 25.3753,
    pricePerNight: 340,
    maxGuests: 4,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.POOL, Amenity.SEA_VIEW, Amenity.TERRACE, Amenity.AIR_CONDITIONING],
    images: pickImages("villaPool", 5, 5),
    ownerEmail: "andreas.papas@seedhost.dev",
    createdMonthsAgo: 30,
  },
  {
    title: "Blue-Domed Studio in Imerovigli",
    description:
      "The classic postcard shot, minus the crowds — a small studio with its own blue-domed terrace in quiet Imerovigli, a short walk from the Skaros Rock viewpoint. Sunset views without the Oia queues.",
    type: PropertyType.APARTMENT,
    city: "Santorini",
    country: "Greece",
    district: "Imerovigli",
    street: "Agiou Georgiou",
    houseNumber: "8",
    latitude: 36.4308,
    longitude: 25.4177,
    pricePerNight: 260,
    maxGuests: 2,
    amenities: [Amenity.WIFI, Amenity.SEA_VIEW, Amenity.TERRACE, Amenity.AIR_CONDITIONING],
    images: pickImages("villaPool", 4, 2),
    ownerEmail: "clara.dubois@seedhost.dev",
    createdMonthsAgo: 13,
  },
];
