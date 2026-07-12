import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const budapestProperties: SeedPropertyTemplate[] = [
  {
    title: "Ruin-Bar District Apartment",
    description:
      "A renovated flat in a crumbling-facade courtyard building right in the Jewish Quarter's ruin-bar cluster. Loud at night if you open the windows, but five minutes from the Danube by day.",
    type: PropertyType.APARTMENT,
    city: "Budapest",
    country: "Hungary",
    district: "Erzsebetvaros",
    street: "Kazinczy utca",
    houseNumber: "14",
    latitude: 47.4966,
    longitude: 19.0632,
    pricePerNight: 38,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.AIR_CONDITIONING, Amenity.CITY_CENTRE],
    images: pickImages("cityApartment", 4, 2),
    ownerEmail: "eszter.nagy@seedhost.dev",
    createdMonthsAgo: 8,
  },
  {
    title: "Thermal Baths View Studio, Buda Side",
    description:
      "A calm studio on the quieter Buda bank, a short tram ride from the Szechenyi and Gellert thermal baths. Compact but well laid out, with a Turkish coffee pot the previous guests keep raving about.",
    type: PropertyType.APARTMENT,
    city: "Budapest",
    country: "Hungary",
    district: "Varosmajor",
    street: "Csaba utca",
    houseNumber: "9",
    latitude: 47.5061,
    longitude: 19.0173,
    pricePerNight: 32,
    maxGuests: 2,
    infantsAllowed: false,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.COFFEE_MACHINE],
    images: pickImages("compactRoom", 4, 3),
    ownerEmail: "isabel.santos@seedhost.dev",
    createdMonthsAgo: 4,
  },
];
