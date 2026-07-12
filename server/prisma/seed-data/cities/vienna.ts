import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const viennaProperties: SeedPropertyTemplate[] = [
  {
    title: "Jugendstil Flat near Naschmarkt",
    description:
      "A high-ceilinged flat in a preserved Jugendstil building, two minutes from the stalls of Naschmarkt. Original stucco cornices upstairs, espresso machine and a well-stocked bookshelf downstairs.",
    type: PropertyType.APARTMENT,
    city: "Vienna",
    country: "Austria",
    district: "Mariahilf",
    street: "Linke Wienzeile",
    houseNumber: "48",
    latitude: 48.1985,
    longitude: 16.3597,
    pricePerNight: 92,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.COFFEE_MACHINE, Amenity.BOOKS, Amenity.HISTORIC_BUILDING, Amenity.KITCHEN],
    images: pickImages("historicEuropean", 4, 10),
    ownerEmail: "hannah.weiss@seedhost.dev",
    createdMonthsAgo: 22,
  },
  {
    title: "Quiet Garden Apartment in Josefstadt",
    description:
      "A ground-floor apartment opening onto a shared courtyard garden in Vienna's smallest and most theatrical district. Coffeehouses and the Rathaus are both an easy walk from the front door.",
    type: PropertyType.APARTMENT,
    city: "Vienna",
    country: "Austria",
    district: "Josefstadt",
    street: "Lange Gasse",
    houseNumber: "61",
    latitude: 48.2103,
    longitude: 16.348,
    pricePerNight: 88,
    maxGuests: 4,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.GARDEN, Amenity.COURTYARD, Amenity.KITCHEN, Amenity.WASHER],
    images: pickImages("cityApartment", 4, 4),
    ownerEmail: "julia.meyer@seedhost.dev",
    createdMonthsAgo: 14,
  },
];
