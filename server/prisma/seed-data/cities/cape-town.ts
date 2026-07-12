import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const capeTownProperties: SeedPropertyTemplate[] = [
  {
    title: "Table Mountain View House in Vredehoek",
    description:
      "A terraced house on the slopes of Vredehoek with Table Mountain filling the entire back garden view. Ten-minute drive to Kloof Street's restaurants, cable car within walking distance.",
    type: PropertyType.HOUSE,
    city: "Cape Town",
    country: "South Africa",
    district: "Vredehoek",
    street: "Upper Union Street",
    houseNumber: "21",
    latitude: -33.9436,
    longitude: 18.4145,
    pricePerNight: 98,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.TERRACE, Amenity.PARKING, Amenity.KITCHEN],
    images: pickImages("cabinCottage", 4, 7),
    ownerEmail: "thabo.nkosi@seedhost.dev",
    createdMonthsAgo: 15,
  },
  {
    title: "Beachfront Apartment in Camps Bay",
    description:
      "A modern apartment across the road from Camps Bay beach, with palm trees framing the view of the Twelve Apostles mountain range. Sundowners on the balcony are non-negotiable here.",
    type: PropertyType.APARTMENT,
    city: "Cape Town",
    country: "South Africa",
    district: "Camps Bay",
    street: "Victoria Road",
    houseNumber: "205",
    latitude: -33.9553,
    longitude: 18.3775,
    pricePerNight: 135,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.BALCONY, Amenity.BEACHFRONT, Amenity.SEA_VIEW, Amenity.AIR_CONDITIONING],
    images: pickImages("beach", 4, 4),
    ownerEmail: "lindiwe.dlamini@seedhost.dev",
    createdMonthsAgo: 22,
  },
];
