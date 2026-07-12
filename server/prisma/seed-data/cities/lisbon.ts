import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const lisbonProperties: SeedPropertyTemplate[] = [
  {
    title: "Tiled Facade Apartment in Alfama",
    description:
      "A traditional Lisbon flat behind a hand-painted azulejo facade in the winding lanes of Alfama. Steep stairs lead up to a small terrace with views over the rooftops toward the Tagus river. Fado bars within earshot most evenings.",
    type: PropertyType.APARTMENT,
    city: "Lisbon",
    country: "Portugal",
    district: "Alfama",
    street: "Rua de Sao Pedro",
    houseNumber: "11",
    latitude: 38.7139,
    longitude: -9.1302,
    pricePerNight: 78,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.TERRACE, Amenity.CITY_CENTRE, Amenity.HISTORIC_BUILDING],
    images: pickImages("historicEuropean", 4, 7),
    ownerEmail: "sofia.almeida@seedhost.dev",
    createdMonthsAgo: 19,
  },
  {
    title: "Tram 28 View House in Graca",
    description:
      "A yellow-shuttered house on one of Graca's steepest streets, right on the Tram 28 route. Two bedrooms, a small kitchen stocked with local ginjinha, and a rooftop miradouro five minutes away on foot.",
    type: PropertyType.HOUSE,
    city: "Lisbon",
    country: "Portugal",
    district: "Graca",
    street: "Rua da Voz do Operario",
    houseNumber: "34",
    latitude: 38.7178,
    longitude: -9.1279,
    pricePerNight: 105,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.TERRACE, Amenity.WASHER, Amenity.CITY_CENTRE],
    images: pickImages("cityApartment", 4, 10),
    ownerEmail: "marta.kowalczyk@seedhost.dev",
    createdMonthsAgo: 12,
  },
];
