import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const copenhagenProperties: SeedPropertyTemplate[] = [
  {
    title: "Colorful Townhouse Flat on Nyhavn",
    description:
      "Wake up to the gabled, candy-colored facades of Nyhavn from your window. Scandinavian minimalist furniture inside a 17th-century shell, with the canal boats docking right outside.",
    type: PropertyType.APARTMENT,
    city: "Copenhagen",
    country: "Denmark",
    district: "Nyhavn",
    street: "Nyhavn",
    houseNumber: "17",
    latitude: 55.6798,
    longitude: 12.5911,
    pricePerNight: 175,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.CANAL_VIEW, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN],
    images: pickImages("minimalistModern", 4, 9),
    ownerEmail: "ingrid.hansen@seedhost.dev",
    createdMonthsAgo: 20,
  },
  {
    title: "Design Apartment in Vesterbro",
    description:
      "A design-forward apartment in Vesterbro, once Copenhagen's meatpacking district and now full of coffee roasters and record shops. Bikes included, because everyone here bikes everywhere.",
    type: PropertyType.APARTMENT,
    city: "Copenhagen",
    country: "Denmark",
    district: "Vesterbro",
    street: "Istedgade",
    houseNumber: "88",
    latitude: 55.6684,
    longitude: 12.5535,
    pricePerNight: 155,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.BIKE_INCLUDED, Amenity.KITCHEN, Amenity.SMART_TV],
    images: pickImages("minimalistModern", 4, 6),
    ownerEmail: "erik.johansson@seedhost.dev",
    createdMonthsAgo: 11,
  },
];
