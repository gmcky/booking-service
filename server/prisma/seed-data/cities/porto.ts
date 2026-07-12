import { PropertyType, Amenity } from "@prisma/client";
import type { SeedPropertyTemplate } from "../types.js";
import { pickImages } from "../images.js";

export const portoProperties: SeedPropertyTemplate[] = [
  {
    title: "Riverside Loft on Ribeira",
    description:
      "An airy loft overlooking the Douro river and the Dom Luis I bridge, a stone's throw from the port wine cellars across the water. Exposed granite walls and a small balcony perfect for evening drinks.",
    type: PropertyType.APARTMENT,
    city: "Porto",
    country: "Portugal",
    district: "Ribeira",
    street: "Rua da Fonte Taurina",
    houseNumber: "20",
    latitude: 41.1408,
    longitude: -8.6122,
    pricePerNight: 82,
    maxGuests: 3,
    amenities: [Amenity.WIFI, Amenity.BALCONY, Amenity.RIVER_VIEW, Amenity.KITCHEN, Amenity.HISTORIC_BUILDING],
    images: pickImages("historicEuropean", 4, 1),
    ownerEmail: "sofia.almeida@seedhost.dev",
    createdMonthsAgo: 6,
  },
  {
    title: "Azulejo Townhouse near Bolhao Market",
    description:
      "A narrow blue-tiled townhouse two streets from Bolhao Market, restored with original wooden floors intact. Great base for wandering the Baixa district and crossing over to Vila Nova de Gaia for port tastings.",
    type: PropertyType.HOUSE,
    city: "Porto",
    country: "Portugal",
    district: "Baixa",
    street: "Rua Formosa",
    houseNumber: "133",
    latitude: 41.1489,
    longitude: -8.6055,
    pricePerNight: 96,
    maxGuests: 5,
    petsAllowed: true,
    amenities: [Amenity.WIFI, Amenity.KITCHEN, Amenity.WASHER, Amenity.CITY_CENTRE, Amenity.HISTORIC_BUILDING],
    images: pickImages("cityApartment", 4, 12),
    ownerEmail: "matteo.greco@seedhost.dev",
    createdMonthsAgo: 26,
  },
];
