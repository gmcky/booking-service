import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const barcelonaProperties: SeedPropertyTemplate[] = [
  {
    title: "Gaudi-Adjacent Flat in Eixample",
    description:
      "A bright modernist-era apartment two blocks from Casa Batllo, with original hydraulic floor tiles and a wrought-iron balcony overlooking Passeig de Gracia's side streets. Perfect base for exploring Barcelona on foot.",
    type: PropertyType.APARTMENT,
    city: "Barcelona",
    country: "Spain",
    district: "Eixample",
    street: "Carrer de Valencia",
    houseNumber: "281",
    apartment: "2A",
    latitude: 41.3927,
    longitude: 2.1627,
    pricePerNight: 145,
    maxGuests: 4,
    amenities: [Amenity.WIFI, Amenity.BALCONY, Amenity.AIR_CONDITIONING, Amenity.KITCHEN, Amenity.ELEVATOR],
    images: pickImages("historicEuropean", 5, 4),
    ownerEmail: "diego.fernandez@seedhost.dev",
    createdMonthsAgo: 15,
  },
  {
    title: "Beachfront Studio in Barceloneta",
    description:
      "Fall asleep to the sound of the Mediterranean in this compact studio a two-minute walk from Barceloneta beach. Simple, breezy, and close to the seafood shacks along the boardwalk.",
    type: PropertyType.APARTMENT,
    city: "Barcelona",
    country: "Spain",
    district: "Barceloneta",
    street: "Carrer de Sant Carles",
    houseNumber: "6",
    latitude: 41.3808,
    longitude: 2.1898,
    pricePerNight: 118,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.AIR_CONDITIONING, Amenity.BEACHFRONT, Amenity.SEA_VIEW],
    images: pickImages("beach", 4, 3),
    ownerEmail: "elena.rossi@seedhost.dev",
    createdMonthsAgo: 9,
  },
];
