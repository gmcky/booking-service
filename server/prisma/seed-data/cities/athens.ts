import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const athensProperties: SeedPropertyTemplate[] = [
  {
    title: "Rooftop Apartment with Acropolis View",
    description:
      "Coffee on the rooftop terrace here comes with a full view of the Acropolis lit up at night. Neoclassical building in Plaka, marble stairwell, and every major ruin within walking distance.",
    type: PropertyType.APARTMENT,
    city: "Athens",
    country: "Greece",
    district: "Plaka",
    street: "Adrianou",
    houseNumber: "70",
    latitude: 37.9722,
    longitude: 23.7285,
    pricePerNight: 95,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.ROOFTOP_TERRACE, Amenity.AIR_CONDITIONING, Amenity.HISTORIC_BUILDING],
    images: pickImages("historicEuropean", 4, 12),
    ownerEmail: "dimitris.papadopoulos@seedhost.dev",
    createdMonthsAgo: 27,
  },
  {
    title: "Bougainvillea Courtyard House, Koukaki",
    description:
      "A single-storey house behind a bougainvillea-covered gate in Koukaki, walking distance to the Acropolis Museum and the metro. Quiet residential street, popular tavernas around the corner.",
    type: PropertyType.HOUSE,
    city: "Athens",
    country: "Greece",
    district: "Koukaki",
    street: "Veikou",
    houseNumber: "45",
    latitude: 37.9633,
    longitude: 23.7256,
    pricePerNight: 78,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.COURTYARD, Amenity.KITCHEN, Amenity.AIR_CONDITIONING, Amenity.GARDEN],
    images: pickImages("cabinCottage", 4, 6),
    ownerEmail: "andreas.papas@seedhost.dev",
    createdMonthsAgo: 33,
  },
];
