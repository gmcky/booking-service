import prismaClientPkg, {
  Role,
  PropertyType,
  Amenity,
  BookingStatus,
  PaymentStatus,
  PayoutStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

const { PrismaClient } = prismaClientPkg;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Public demo account: intentionally shareable. Has no properties or bookings,
// so a logged-in visitor can only create their own data and cannot destroy
// seeded content used by other reviewers.
const PUBLIC_DEMO_PASSWORD = "demo1234";

type SeededUser = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: Role;
  // Source of truth for the password:
  //   "public"   — fixed credential exposed in README.
  //   envVar     — read from process.env[<envVar>]; if unset, a random one is
  //                generated, logged once, and never persisted in plaintext.
  passwordSource: { kind: "public"; value: string } | { kind: "env"; envVar: string };
};

const users: SeededUser[] = [
  {
    email: "demo@booking.dev",
    firstName: "Demo",
    lastName: "Visitor",
    phoneNumber: "+380501110000",
    role: Role.USER,
    passwordSource: { kind: "public", value: PUBLIC_DEMO_PASSWORD },
  },
  {
    email: "owner@demo.com",
    firstName: "Alex",
    lastName: "Kovalenko",
    phoneNumber: "+380501234567",
    role: Role.USER,
    passwordSource: { kind: "env", envVar: "SEED_OWNER1_PASSWORD" },
  },
  {
    email: "owner2@demo.com",
    firstName: "Oleh",
    lastName: "Sirko",
    phoneNumber: "+380509998877",
    role: Role.USER,
    passwordSource: { kind: "env", envVar: "SEED_OWNER2_PASSWORD" },
  },
  {
    email: "admin@demo.com",
    firstName: "Maria",
    lastName: "Shevchenko",
    phoneNumber: "+380631234567",
    role: Role.ADMIN,
    passwordSource: { kind: "env", envVar: "SEED_ADMIN_PASSWORD" },
  },
  {
    email: "user@demo.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    phoneNumber: "+380671234567",
    role: Role.USER,
    passwordSource: { kind: "env", envVar: "SEED_USER1_PASSWORD" },
  },
  {
    email: "user2@demo.com",
    firstName: "Olena",
    lastName: "Melnyk",
    phoneNumber: "+380672345678",
    role: Role.USER,
    passwordSource: { kind: "env", envVar: "SEED_USER2_PASSWORD" },
  },
  {
    email: "user3@demo.com",
    firstName: "Dmytro",
    lastName: "Bondarenko",
    phoneNumber: "+380673456789",
    role: Role.USER,
    passwordSource: { kind: "env", envVar: "SEED_USER3_PASSWORD" },
  },
];

function resolvePassword(
  source: SeededUser["passwordSource"],
  generated: Map<string, string>,
): { value: string; origin: "public" | "env" | "generated" } {
  if (source.kind === "public") {
    return { value: source.value, origin: "public" };
  }
  const fromEnv = process.env[source.envVar];
  if (fromEnv && fromEnv.length > 0) {
    return { value: fromEnv, origin: "env" };
  }
  const random = crypto.randomBytes(18).toString("base64url");
  generated.set(source.envVar, random);
  return { value: random, origin: "generated" };
}

const propertyTemplates: Array<{
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  country: string;
  district?: string;
  address: string;
  pricePerNight: number;
  maxGuests: number;
  amenities: Amenity[];
  images: string[];
}> = [
  {
    title: "Modern Studio in Podil",
    description:
      "A stylish studio apartment in the heart of Podil — Kyiv's most vibrant neighbourhood. Floor-to-ceiling windows with views of the Dnipro, a fully equipped kitchen and a fast Wi-Fi connection make it perfect for remote work or a relaxing city break.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    country: "Ukraine",
    district: "Podil",
    address: "Kontraktova Square 4, Podil",
    pricePerNight: 55,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.AIR_CONDITIONING,
      Amenity.KITCHEN,
      Amenity.WASHER,
    ],
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Spacious 2BR Apartment near Khreshchatyk",
    description:
      "A generous two-bedroom apartment just two minutes' walk from Kyiv's main boulevard. Classic Ukrainian interior blended with modern amenities: a projector screen, coffee machine and a soaking tub. Ideal for couples or small families.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    country: "Ukraine",
    district: "Shevchenkivskyi",
    address: "Shevchenka Blvd 12, apt 7",
    pricePerNight: 85,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.WASHER,
      Amenity.PROJECTOR,
      Amenity.BATHTUB,
      Amenity.GYM,
    ],
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Cosy Room in Historic Pechersk",
    description:
      "A quiet private room in a shared apartment in Pechersk, a short metro ride from Lavra monastery and the main business district. Great natural light, a comfy bed and a private bathroom.",
    type: PropertyType.HOTEL_ROOM,
    city: "Kyiv",
    country: "Ukraine",
    district: "Pechersk",
    address: "Lypska St 3, Pechersk",
    pricePerNight: 30,
    maxGuests: 1,
    amenities: [
      Amenity.WIFI,
      Amenity.AIR_CONDITIONING,
      Amenity.PRIVATE_BATHROOM,
    ],
    images: [
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Designer Loft on Vozdvizhenka",
    description:
      "A stunning loft apartment in one of Kyiv's most photogenic streets. Exposed brick walls, designer furniture, a record player and a rooftop terrace are waiting for you.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    country: "Ukraine",
    district: "Podil",
    address: "Vozdvyzhenka St 10",
    pricePerNight: 120,
    maxGuests: 3,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.ROOFTOP_TERRACE,
      Amenity.VINYL_RECORD_PLAYER,
      Amenity.COFFEE_MACHINE,
    ],
    images: [
      "https://images.unsplash.com/photo-1549187774-b4e9b0445b41?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1461360228754-6e81c478b882?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Private House with Garden, Obolon",
    description:
      "A charming private house with a landscaped garden in the quiet Obolon district, on the left bank of the Dnipro. Three bedrooms, a barbecue area and a children's playground on site.",
    type: PropertyType.HOUSE,
    city: "Kyiv",
    country: "Ukraine",
    district: "Obolon",
    address: "Obolonska St 22, Obolon",
    pricePerNight: 150,
    maxGuests: 8,
    amenities: [
      Amenity.WIFI,
      Amenity.PARKING,
      Amenity.GARDEN,
      Amenity.BBQ,
      Amenity.WASHER,
      Amenity.DISHWASHER,
      Amenity.KIDS_PLAY_AREA,
    ],
    images: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Old Town Apartment in Lviv Centre",
    description:
      "A beautiful apartment inside a 19th-century building on the most prestigious street in Lviv. Original oak parquet, 3-metre ceilings and windows overlooking the Latin Cathedral. Walking distance to every major landmark.",
    type: PropertyType.APARTMENT,
    city: "Lviv",
    country: "Ukraine",
    district: "Old Town",
    address: "Shevska St 5, Old Town",
    pricePerNight: 65,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.HISTORIC_BUILDING,
      Amenity.CITY_CENTRE,
    ],
    images: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Cosy Cottage near Lychakiv Cemetery",
    description:
      "A romantic two-storey cottage on a quiet street near the famous Lychakiv Cemetery. Wooden beams, a fireplace and a private courtyard with rose bushes. Perfect for a romantic weekend escape.",
    type: PropertyType.HOUSE,
    city: "Lviv",
    country: "Ukraine",
    district: "Lychakiv",
    address: "Mechnikova St 18",
    pricePerNight: 90,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.FIREPLACE,
      Amenity.COURTYARD,
      Amenity.PARKING,
      Amenity.KITCHEN,
    ],
    images: [
      "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1595877244574-e90ce41ce089?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Modern Apartment near Rynok Square",
    description:
      "A freshly renovated apartment 200 m from Rynok Square. The interior blends Lviv's Austro-Hungarian heritage with Scandinavian minimalism. Nespresso machine included, specialty coffee shops at the doorstep.",
    type: PropertyType.APARTMENT,
    city: "Lviv",
    country: "Ukraine",
    district: "Old Town",
    address: "Stavropigijska St 9",
    pricePerNight: 75,
    maxGuests: 3,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.COFFEE_MACHINE,
      Amenity.CITY_CENTRE,
      Amenity.AIR_CONDITIONING,
    ],
    images: [
      "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Sea View Apartment in Arcadia",
    description:
      "A bright apartment with panoramic views of the Black Sea, just 50 metres from Arcadia beach. Spend the day on the sand and the evening on your private balcony watching the sunset. Summer-ready: air-conditioned and with beach towels provided.",
    type: PropertyType.APARTMENT,
    city: "Odesa",
    country: "Ukraine",
    district: "Arcadia",
    address: "Genuezska St 24, Arcadia",
    pricePerNight: 95,
    maxGuests: 3,
    amenities: [
      Amenity.WIFI,
      Amenity.AIR_CONDITIONING,
      Amenity.SEA_VIEW,
      Amenity.BALCONY,
      Amenity.BEACHFRONT,
      Amenity.KITCHEN,
    ],
    images: [
      "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Heritage Apartment on Derybasivska",
    description:
      "Step back in time in this stunning apartment inside a 19th-century mansion on Odesa's most famous pedestrian street. Antique furniture, high ceilings and ornate moulding — combined with modern Wi-Fi and air conditioning.",
    type: PropertyType.APARTMENT,
    city: "Odesa",
    country: "Ukraine",
    district: "City Centre",
    address: "Derybasivska St 16",
    pricePerNight: 80,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.AIR_CONDITIONING,
      Amenity.HISTORIC_BUILDING,
      Amenity.CITY_CENTRE,
    ],
    images: [
      "https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Beach House with Private Pool",
    description:
      "A luxurious private beach house with an infinity pool overlooking the sea. Four bedrooms, a fully equipped BBQ terrace and direct beach access via a private staircase. Ideal for groups or family holidays.",
    type: PropertyType.HOUSE,
    city: "Odesa",
    country: "Ukraine",
    district: "Fontanka",
    address: "Fontanska Rd 40, Fontanka",
    pricePerNight: 280,
    maxGuests: 10,
    amenities: [
      Amenity.WIFI,
      Amenity.POOL,
      Amenity.BBQ,
      Amenity.PARKING,
      Amenity.BEACHFRONT,
      Amenity.AIR_CONDITIONING,
      Amenity.SMART_TV,
    ],
    images: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Minimalist Studio in Mitte",
    description:
      "A sleek, minimalist studio in the very centre of Berlin, ideal for business travellers. Fast fibre internet, a stand-up desk, and a curated art collection. Five minutes on foot to Museum Island.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    country: "Germany",
    district: "Mitte",
    address: "Rosenthaler Str 25, Mitte",
    pricePerNight: 110,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.STANDING_DESK,
      Amenity.AIR_CONDITIONING,
      Amenity.CITY_CENTRE,
    ],
    images: [
      "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1493934558415-9d19f0b2b4d2?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Kreuzberg Loft with Courtyard",
    description:
      "A spacious loft in Berlin's most creative district. Industrial-chic aesthetics — steel beams, polished concrete floors, floor-to-ceiling bookshelves. Private access to a shared courtyard garden.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    country: "Germany",
    district: "Kreuzberg",
    address: "Oranienstr 58, Kreuzberg",
    pricePerNight: 135,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.COURTYARD,
      Amenity.WASHER,
      Amenity.BOOKS,
    ],
    images: [
      "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Classic Berlin Altbau near Prenzlauer Berg",
    description:
      "A traditional Berlin Altbau (pre-war building) with beautiful stucco ceilings and herringbone parquet. Three rooms, a large eat-in kitchen and a balcony overlooking a tree-lined street.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    country: "Germany",
    district: "Prenzlauer Berg",
    address: "Kastanienallee 12, Prenzlauer Berg",
    pricePerNight: 100,
    maxGuests: 5,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.BALCONY,
      Amenity.WASHER,
      Amenity.BIKE_RENTAL_NEARBY,
    ],
    images: [
      "https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Charming Studio near the Eiffel Tower",
    description:
      "Ooh la la! A romantic studio for two in the 7th arrondissement, a short walk from the Eiffel Tower. French antique furniture, a Nespresso machine and a tiny balcony with iron railings — quintessentially Parisian.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    country: "France",
    district: "7th arrondissement",
    address: "Rue de Grenelle 42, 7ème",
    pricePerNight: 160,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.COFFEE_MACHINE,
      Amenity.BALCONY,
      Amenity.AIR_CONDITIONING,
      Amenity.CITY_CENTRE,
    ],
    images: [
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1489171078254-c3365d6e359f?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Haussmann Apartment in Le Marais",
    description:
      "A classic Haussmann building apartment in the heart of Le Marais — Paris's most fashionable neighbourhood. Two bedrooms, parquet floors, exposed stone walls and high ceilings. Steps from Place des Vosges.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    country: "France",
    district: "Le Marais",
    address: "Rue de Bretagne 18, Le Marais, 3ème",
    pricePerNight: 210,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.KITCHEN,
      Amenity.AIR_CONDITIONING,
      Amenity.DISHWASHER,
      Amenity.HISTORIC_BUILDING,
    ],
    images: [
      "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Trastevere Apartment with Rooftop",
    description:
      "Lose yourself in Rome's most charming neighbourhood. This bright apartment features original terracotta tiles, arched doorways and a shared rooftop terrace with views of the basilicas. Fall asleep to the sound of fountains beneath your window.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    country: "Italy",
    district: "Trastevere",
    address: "Via della Lungara 15, Trastevere",
    pricePerNight: 130,
    maxGuests: 3,
    amenities: [
      Amenity.WIFI,
      Amenity.ROOFTOP_TERRACE,
      Amenity.KITCHEN,
      Amenity.AIR_CONDITIONING,
      Amenity.CITY_CENTRE,
    ],
    images: [
      "https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1615529182904-14819c35db37?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Historic Flat near the Colosseum",
    description:
      "Wake up with a view of the Colosseum from this beautifully restored 2-bedroom apartment. Original Roman stone arches in the living area, a full kitchen and a quiet rear-facing terrace for evening aperitivo.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    country: "Italy",
    district: "Centro Storico",
    address: "Via Sacra 8, Centro Storico",
    pricePerNight: 175,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.TERRACE,
      Amenity.KITCHEN,
      Amenity.HISTORIC_BUILDING,
      Amenity.AIR_CONDITIONING,
    ],
    images: [
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800",
    ],
  },

  {
    title: "Canal House Apartment, Jordaan",
    description:
      "Live like a local in a narrow Dutch canal house in the Jordaan — Amsterdam's most picturesque neighbourhood. Original wooden beams, a steep canal-house staircase and a private terrace overlooking the Prinsengracht canal.",
    type: PropertyType.APARTMENT,
    city: "Amsterdam",
    country: "Netherlands",
    district: "Jordaan",
    address: "Prinsengracht 204, Jordaan",
    pricePerNight: 195,
    maxGuests: 2,
    amenities: [
      Amenity.WIFI,
      Amenity.TERRACE,
      Amenity.CANAL_VIEW,
      Amenity.KITCHEN,
      Amenity.BIKE_INCLUDED,
    ],
    images: [
      "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Modern Houseboat on the IJ",
    description:
      "An innovative stay — a fully renovated houseboat moored on the IJ river with stunning views of Amsterdam's skyline. Two bedrooms, a sun deck and a kayak available for guests. Unique, unforgettable, quintessentially Amsterdam.",
    type: PropertyType.HOUSE,
    city: "Amsterdam",
    country: "Netherlands",
    district: "Noord",
    address: "NDSM Wharf, Amsterdam Noord",
    pricePerNight: 220,
    maxGuests: 4,
    amenities: [
      Amenity.WIFI,
      Amenity.SUN_DECK,
      Amenity.KAYAK,
      Amenity.KITCHEN,
      Amenity.RIVER_VIEW,
      Amenity.PARKING,
    ],
    images: [
      "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=800",
    ],
  },
];

function getStayDates(checkInOffsetDays: number, nights: number) {
  const dayMs = 24 * 60 * 60 * 1000;
  const checkIn = new Date(Date.now() + checkInOffsetDays * dayMs);
  checkIn.setHours(14, 0, 0, 0);

  const checkOut = new Date(checkIn.getTime() + nights * dayMs);
  checkOut.setHours(12, 0, 0, 0);

  return { checkIn, checkOut, nights };
}

// Keep seed deterministic: stable snapshots across reruns/CI.
faker.seed(20260406);

// Skewed distribution: realistic demo payload (mostly 4-5, some 3).
const reviewRatingPool = [5, 5, 5, 4, 4, 4, 3, 3] as const;

const reviewOpeners = [
  "Really enjoyed this stay.",
  "Overall, this was a solid booking.",
  "We had a pleasant stay here.",
  "This place worked very well for our trip.",
  "Stayed here recently and had a good experience.",
  "Came with moderate expectations and was positively surprised.",
];

const reviewTripContexts = [
  "for a short city break",
  "during a work trip",
  "for a weekend getaway",
  "while visiting friends nearby",
  "for a few nights before a conference",
  "as a base to explore the area",
];

const reviewPositives = [
  "the place was spotless on arrival",
  "check-in instructions were clear and easy to follow",
  "Wi-Fi was stable for video calls",
  "the bed was genuinely comfortable",
  "kitchen had everything needed for simple meals",
  "host replies were quick and polite",
  "photos matched reality",
  "location made it easy to get around",
  "the apartment felt safe even late at night",
  "heating and hot water worked perfectly",
  "noise insulation was better than expected",
  "common areas were tidy and well maintained",
];

const reviewNegatives = [
  "street noise was noticeable after midnight",
  "soundproofing between rooms could be better",
  "shower pressure was weaker than expected",
  "sofa in the living room is starting to wear out",
  "blackout curtains did not fully block the morning light",
  "elevator wait time was long during peak hours",
  "parking nearby was hard to find in the evening",
  "air conditioning needed extra time to cool the room",
  "there was a slight smell in the hallway in the evening",
  "pillows were too soft for my preference",
];

const reviewClosingsPositive = [
  "Would happily book this place again.",
  "I would recommend it to friends.",
  "Would return on the next trip.",
  "Good value for money overall.",
  "Easy recommendation for similar trips.",
];

const reviewClosingsNeutral = [
  "Still a decent option if your expectations are realistic.",
  "With a couple of tweaks this place could be excellent.",
  "Not perfect, but overall satisfactory for the price.",
  "Could be improved in small details, but it did the job.",
];

const reviewDetailSnippets = [
  () =>
    `We arrived around ${faker.number.int({ min: 15, max: 23 })}:00 and got in without issues.`,
  () =>
    `The walk to public transport took about ${faker.number.int({ min: 4, max: 14 })} minutes.`,
  () =>
    `We stayed for ${faker.number.int({ min: 2, max: 7 })} nights and the experience stayed consistent throughout.`,
  () =>
    `Room temperature stayed comfortable at around ${faker.number.int({ min: 20, max: 24 })} degrees.`,
  () =>
    `I especially appreciated the ${faker.helpers.arrayElement(["clear house manual", "quick support in chat", "self check-in flow", "well-organized kitchen essentials"])}.`,
];

function buildReviewComment(params: {
  rating: number;
  propertyTitle: string;
  usedComments: Set<string>;
}): string {
  const { rating, propertyTitle, usedComments } = params;
  const positiveCount = rating >= 5 ? 3 : rating === 4 ? 2 : 1;

  // Hard cap avoids pathological loops when combination space gets tight.
  for (let attempt = 0; attempt < 40; attempt++) {
    const negativeCount =
      rating >= 5 ? 0 : rating === 4 ? faker.number.int({ min: 0, max: 1 }) : 1;

    const positives = faker.helpers.arrayElements(reviewPositives, positiveCount);
    const negatives =
      negativeCount > 0
        ? faker.helpers.arrayElements(reviewNegatives, negativeCount)
        : [];

    const opener = faker.helpers.arrayElement(reviewOpeners);
    const tripContext = faker.helpers.arrayElement(reviewTripContexts);
    const detail = faker.helpers.arrayElement(reviewDetailSnippets)();
    const closing =
      rating >= 4
        ? faker.helpers.arrayElement(reviewClosingsPositive)
        : faker.helpers.arrayElement(reviewClosingsNeutral);

    const positivesText = positives.join("; ");
    const negativesText =
      negatives.length > 0 ? ` Minor downside: ${negatives.join("; ")}.` : "";

    const comment = `${opener} Stayed at ${propertyTitle} ${tripContext}. Highlights: ${positivesText}.${negativesText} ${detail} ${closing}`;

    if (!usedComments.has(comment)) {
      usedComments.add(comment);
      return comment;
    }
  }

  // Collision fallback: guarantees uniqueness without blocking the seed run.
  const fallback = `${propertyTitle} had a ${rating >= 4 ? "good" : "decent"} overall experience. Ref ${faker.string.alphanumeric({ length: 8, casing: "upper" })}.`;
  usedComments.add(fallback);
  return fallback;
}

async function main() {
  console.log("🌱 Starting seed...");

  const createdUsers: Record<string, { id: string }> = {};
  const generatedPasswords = new Map<string, string>();
  const resolvedCreds: Array<{
    email: string;
    role: Role;
    password: string;
    origin: "public" | "env" | "generated";
  }> = [];

  for (const user of users) {
    const resolved = resolvePassword(user.passwordSource, generatedPasswords);
    const passwordHash = await bcrypt.hash(resolved.value, 12);
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
      },
    });
    createdUsers[user.email] = { id: created.id };
    resolvedCreds.push({
      email: user.email,
      role: user.role,
      password: resolved.value,
      origin: resolved.origin,
    });
    console.log(`  ✅ User: ${user.email} (${user.role}) [pwd from ${resolved.origin}]`);
  }

  const owner1Id = createdUsers["owner@demo.com"]!.id;
  const owner2Id = createdUsers["owner2@demo.com"]!.id;

  let created = 0;
  const createdProperties: Array<{
    id: string;
    title: string;
    pricePerNight: number;
    maxGuests: number;
  }> = [];

  for (const [index, template] of propertyTemplates.entries()) {
    const assignedOwnerId = index % 2 === 0 ? owner1Id : owner2Id;

    const createdProperty = await prisma.property.create({
      data: {
        ...template,
        pricePerNight: template.pricePerNight,
        ownerId: assignedOwnerId,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        pricePerNight: true,
        maxGuests: true,
      },
    });

    createdProperties.push({
      id: createdProperty.id,
      title: createdProperty.title,
      pricePerNight: Number(createdProperty.pricePerNight),
      maxGuests: createdProperty.maxGuests,
    });

    created++;
    console.log(
      `  🏠 ${template.title} — ${template.city} ($${template.pricePerNight}/night)`,
    );
  }

  type BookingScenario = {
    code: string;
    bookerEmail: string;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus | null;
    checkInOffsetDays: number;
    nights: number;
    payoutStatus?: PayoutStatus;
  };

  const bookingScenarios: BookingScenario[] = [
    {
      code: "MANUAL_PENDING_INTENT",
      bookerEmail: "user@demo.com",
      bookingStatus: "PENDING",
      paymentStatus: null,
      checkInOffsetDays: 10,
      nights: 3,
    },
    {
      code: "MANUAL_PENDING_SHORT_WINDOW",
      bookerEmail: "user@demo.com",
      bookingStatus: "PENDING",
      paymentStatus: null,
      checkInOffsetDays: 3,
      nights: 2,
    },
    {
      code: "MANUAL_CONFIRMED_SUCCESS_AUTO_REFUND",
      bookerEmail: "user@demo.com",
      bookingStatus: "CONFIRMED",
      paymentStatus: "SUCCESS",
      checkInOffsetDays: 10,
      nights: 4,
    },
    {
      code: "MANUAL_CONFIRMED_SUCCESS_MANUAL_REFUND",
      bookerEmail: "user@demo.com",
      bookingStatus: "CONFIRMED",
      paymentStatus: "SUCCESS",
      checkInOffsetDays: 3,
      nights: 2,
    },
    {
      code: "MANUAL_CONFIRMED_REFUND_REQUESTED",
      bookerEmail: "user@demo.com",
      bookingStatus: "CONFIRMED",
      paymentStatus: "REFUND_REQUESTED",
      checkInOffsetDays: 5,
      nights: 3,
    },
    {
      code: "MANUAL_CANCELLED_REFUNDED",
      bookerEmail: "user@demo.com",
      bookingStatus: "CANCELLED",
      paymentStatus: "REFUNDED",
      payoutStatus: "CANCELLED",
      checkInOffsetDays: 14,
      nights: 2,
    },
    {
      code: "MANUAL_COMPLETED_SUCCESS_REVIEW",
      bookerEmail: "user@demo.com",
      bookingStatus: "COMPLETED",
      paymentStatus: "SUCCESS",
      checkInOffsetDays: -18,
      nights: 5,
    },
    {
      code: "MANUAL_ACTIVE_NOW_CONFIRMED",
      bookerEmail: "user@demo.com",
      bookingStatus: "CONFIRMED",
      paymentStatus: "SUCCESS",
      checkInOffsetDays: -2,
      nights: 7,
    },
    {
      code: "ABAC_FOREIGN_CONFIRMED_SUCCESS",
      bookerEmail: "user2@demo.com",
      bookingStatus: "CONFIRMED",
      paymentStatus: "SUCCESS",
      checkInOffsetDays: 9,
      nights: 3,
    },
  ];

  const seededScenarioRefs: Array<{
    code: string;
    userEmail: string;
    bookingId: string;
    bookingStatus: BookingStatus;
    paymentId: string | null;
    paymentStatus: PaymentStatus | null;
  }> = [];

  let createdBookings = 0;
  for (const [index, scenario] of bookingScenarios.entries()) {
    const userId = createdUsers[scenario.bookerEmail]?.id;
    if (!userId) {
      throw new Error(`Seed user not found for scenario: ${scenario.bookerEmail}`);
    }

    const property = createdProperties[index % createdProperties.length]!;
    const stay = getStayDates(scenario.checkInOffsetDays, scenario.nights);

    const guests = Math.min(2 + (index % 2), property.maxGuests);
    const totalPrice = property.pricePerNight * stay.nights;

    const bookingCreateData: any = {
      propertyId: property.id,
      userId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      totalPrice,
      guests,
      status: scenario.bookingStatus,
      payoutStatus: scenario.payoutStatus ?? "PENDING",
    };

    if (scenario.bookingStatus === "COMPLETED") {
      bookingCreateData.actualCheckOutAt = stay.checkOut;
    }

    if (scenario.paymentStatus) {
      const paymentMetadata: Record<string, unknown> = {
        seededScenario: scenario.code,
      };

      if (scenario.paymentStatus === "REFUND_REQUESTED") {
        paymentMetadata.refundRequest = {
          requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          requestedBy: userId,
          refundPercent: 50,
          refundAmount: totalPrice * 0.5,
          daysUntilCheckIn: Math.max(0, Math.ceil(scenario.checkInOffsetDays)),
        };
      }

      bookingCreateData.payment = {
        create: {
          amount: totalPrice,
          currency: "USD",
          status: scenario.paymentStatus,
          provider: "STRIPE",
          transactionId: `seed_pi_${scenario.code.toLowerCase()}_${index + 1}`,
          metadata: paymentMetadata,
        },
      };
    }

    const createdBooking = await prisma.booking.create({
      data: bookingCreateData,
      select: {
        id: true,
        status: true,
        payment: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    seededScenarioRefs.push({
      code: scenario.code,
      userEmail: scenario.bookerEmail,
      bookingId: createdBooking.id,
      bookingStatus: createdBooking.status,
      paymentId: createdBooking.payment?.id ?? null,
      paymentStatus: createdBooking.payment?.status ?? null,
    });

    createdBookings++;
    console.log(
      `  📅 Booking #${index + 1} (${scenario.code}) — ${scenario.bookerEmail} — ${scenario.bookingStatus}${scenario.paymentStatus ? ` / ${scenario.paymentStatus}` : " / no payment"} — ${property.title}`,
    );
  }

  const completedBookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
    },
    select: {
      id: true,
      userId: true,
      propertyId: true,
      property: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      checkOut: "desc",
    },
  });

  let seededReviews = 0;
  const touchedPropertyIds = new Set<string>();
  const usedReviewComments = new Set<string>();

  for (const [index, booking] of completedBookings.entries()) {
    const rating = faker.helpers.arrayElement(reviewRatingPool);
    const comment = buildReviewComment({
      rating,
      propertyTitle: booking.property.title,
      usedComments: usedReviewComments,
    });

    await prisma.review.upsert({
      where: {
        bookingId: booking.id,
      },
      // bookingId is unique: upsert keeps reruns idempotent.
      update: {
        userId: booking.userId,
        propertyId: booking.propertyId,
        rating,
        comment,
      },
      create: {
        bookingId: booking.id,
        userId: booking.userId,
        propertyId: booking.propertyId,
        rating,
        comment,
      },
    });

    touchedPropertyIds.add(booking.propertyId);
    seededReviews++;

    console.log(
      `  ⭐ Review #${index + 1} for booking ${booking.id} — ${booking.property.title} (${rating}/5)`,
    );
  }

  for (const propertyId of touchedPropertyIds) {
    const reviewStats = await prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: { id: true },
    });

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        averageRating:
          reviewStats._avg.rating === null
            ? null
            : Number(reviewStats._avg.rating.toFixed(1)),
        reviewCount: reviewStats._count.id,
      },
    });
  }

  if (seededReviews === 0) {
    console.log("  ℹ️ No completed bookings found, so no reviews were created.");
  }

  console.log(
    `\n✅ Seed complete: ${users.length} users, ${created} properties, ${createdBookings} bookings, ${seededReviews} reviews`,
  );
  console.log("\nManual testing checkpoints:");
  for (const ref of seededScenarioRefs) {
    const paymentInfo = ref.paymentId
      ? `payment=${ref.paymentId} (${ref.paymentStatus})`
      : "payment=none";
    console.log(
      `  ${ref.code.padEnd(38)} booking=${ref.bookingId} (${ref.bookingStatus}) | ${paymentInfo} | user=${ref.userEmail}`,
    );
  }
  console.log("\nTest credentials:");
  for (const cred of resolvedCreds) {
    if (cred.origin === "public") {
      console.log(`  ${cred.role.padEnd(5)} ${cred.email}  /  ${cred.password}  (public demo)`);
    } else if (cred.origin === "env") {
      console.log(`  ${cred.role.padEnd(5)} ${cred.email}  /  <from env>`);
    } else {
      console.log(`  ${cred.role.padEnd(5)} ${cred.email}  /  ${cred.password}  (GENERATED — save now)`);
    }
  }

  if (generatedPasswords.size > 0) {
    console.log(
      "\n Random passwords were generated for these env vars. Copy them into your .env now — they will not be shown again:",
    );
    for (const [envVar, value] of generatedPasswords) {
      console.log(`  ${envVar}=${value}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
