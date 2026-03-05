import { Role, PropertyType } from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "../src/shared/lib/prisma.js";

//console.log("DEBUG: DATABASE_URL is:", process.env.DATABASE_URL);
// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------
const users = [
  {
    email: "owner@demo.com",
    firstName: "Alex",
    lastName: "Kovalenko",
    phoneNumber: "+380501234567",
    role: Role.OWNER,
    password: "Own3r_P@ss_2026!",
  },
  {
    email: "owner2@demo.com",
    firstName: "Oleh",
    lastName: "Sirko",
    phoneNumber: "+380509998877",
    role: Role.OWNER,
    password: "0wn3r2_S3cr3t#",
  },
  {
    email: "admin@demo.com",
    firstName: "Maria",
    lastName: "Shevchenko",
    phoneNumber: "+380631234567",
    role: Role.ADMIN,
    password: "Adm1n_Mast3rK3y!",
  },
  {
    email: "user@demo.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    phoneNumber: "+380671234567",
    role: Role.USER,
    password: "Us3r_D3mo_456*",
  },
];

// ---------------------------------------------------------------------------
// Property seed data (массив оставил твоим, он отличный)
// ---------------------------------------------------------------------------
const propertyTemplates: Array<{
  title: string;
  description: string;
  type: PropertyType;
  city: string;
  address: string;
  pricePerNight: number;
  maxGuests: number;
  amenities: string[];
  images: string[];
}> = [
  // ── Kyiv ──────────────────────────────────────────────────────────────────
  {
    title: "Modern Studio in Podil",
    description:
      "A stylish studio apartment in the heart of Podil — Kyiv's most vibrant neighbourhood. Floor-to-ceiling windows with views of the Dnipro, a fully equipped kitchen and a fast Wi-Fi connection make it perfect for remote work or a relaxing city break.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    address: "Kontraktova Square 4, Podil",
    pricePerNight: 55,
    maxGuests: 2,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Washing Machine"],
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1560185007-5f0a3b7a6ac7?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Spacious 2BR Apartment near Khreshchatyk",
    description:
      "A generous two-bedroom apartment just two minutes' walk from Kyiv's main boulevard. Classic Ukrainian interior blended with modern amenities: a projector screen, coffee machine and a soaking tub. Ideal for couples or small families.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    address: "Shevchenka Blvd 12, apt 7",
    pricePerNight: 85,
    maxGuests: 4,
    amenities: [
      "Wi-Fi",
      "Kitchen",
      "Washer",
      "Projector",
      "Bathtub",
      "Gym Access",
    ],
    images: [
      "https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Cosy Room in Historic Pechersk",
    description:
      "A quiet private room in a shared apartment in Pechersk, a short metro ride from Lavra monastery and the main business district. Great natural light, a comfy bed and a private bathroom.",
    type: PropertyType.HOTEL_ROOM,
    city: "Kyiv",
    address: "Lypska St 3, Pechersk",
    pricePerNight: 30,
    maxGuests: 1,
    amenities: ["Wi-Fi", "Air Conditioning", "Private Bathroom"],
    images: [
      "https://images.unsplash.com/photo-1568605117036-5f326c888be4?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Designer Loft on Vozdvizhenka",
    description:
      "A stunning loft apartment in one of Kyiv's most photogenic streets. Exposed brick walls, designer furniture, a record player and a rooftop terrace are waiting for you.",
    type: PropertyType.APARTMENT,
    city: "Kyiv",
    address: "Vozdvyzhenka St 10",
    pricePerNight: 120,
    maxGuests: 3,
    amenities: [
      "Wi-Fi",
      "Kitchen",
      "Rooftop Terrace",
      "Vinyl Record Player",
      "Coffee Machine",
    ],
    images: [
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd3?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Private House with Garden, Obolon",
    description:
      "A charming private house with a landscaped garden in the quiet Obolon district, on the left bank of the Dnipro. Three bedrooms, a barbecue area and a children's playground on site.",
    type: PropertyType.HOUSE,
    city: "Kyiv",
    address: "Obolonska St 22, Obolon",
    pricePerNight: 150,
    maxGuests: 8,
    amenities: [
      "Wi-Fi",
      "Parking",
      "Garden",
      "BBQ",
      "Washer",
      "Dishwasher",
      "Kids Play Area",
    ],
    images: [
      "https://images.unsplash.com/photo-1449247613801-f6d4b7a43176?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800",
    ],
  },

  // ── Lviv ──────────────────────────────────────────────────────────────────
  {
    title: "Old Town Apartment in Lviv Centre",
    description:
      "A beautiful apartment inside a 19th-century building on the most prestigious street in Lviv. Original oak parquet, 3-metre ceilings and windows overlooking the Latin Cathedral. Walking distance to every major landmark.",
    type: PropertyType.APARTMENT,
    city: "Lviv",
    address: "Shevska St 5, Old Town",
    pricePerNight: 65,
    maxGuests: 2,
    amenities: ["Wi-Fi", "Kitchen", "Historic Building", "City Centre"],
    images: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1555854877-bab93439e74d?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Cosy Cottage near Lychakiv Cemetery",
    description:
      "A romantic two-storey cottage on a quiet street near the famous Lychakiv Cemetery. Wooden beams, a fireplace and a private courtyard with rose bushes. Perfect for a romantic weekend escape.",
    type: PropertyType.HOUSE,
    city: "Lviv",
    address: "Mechnikova St 18",
    pricePerNight: 90,
    maxGuests: 4,
    amenities: ["Wi-Fi", "Fireplace", "Courtyard", "Parking", "Kitchen"],
    images: [
      "https://images.unsplash.com/photo-1464082354059-d9b74de0e530?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1615873968403-89583c888e04?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Modern Apartment near Rynok Square",
    description:
      "A freshly renovated apartment 200 m from Rynok Square. The interior blends Lviv's Austro-Hungarian heritage with Scandinavian minimalism. Nespresso machine included, specialty coffee shops at the doorstep.",
    type: PropertyType.APARTMENT,
    city: "Lviv",
    address: "Stavropigijska St 9",
    pricePerNight: 75,
    maxGuests: 3,
    amenities: [
      "Wi-Fi",
      "Kitchen",
      "Coffee Machine",
      "City Centre",
      "Air Conditioning",
    ],
    images: [
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=800",
    ],
  },

  // ── Odesa ─────────────────────────────────────────────────────────────────
  {
    title: "Sea View Apartment in Arcadia",
    description:
      "A bright apartment with panoramic views of the Black Sea, just 50 metres from Arcadia beach. Spend the day on the sand and the evening on your private balcony watching the sunset. Summer-ready: air-conditioned and with beach towels provided.",
    type: PropertyType.APARTMENT,
    city: "Odesa",
    address: "Genuezska St 24, Arcadia",
    pricePerNight: 95,
    maxGuests: 3,
    amenities: [
      "Wi-Fi",
      "Air Conditioning",
      "Sea View",
      "Balcony",
      "Beachfront",
      "Kitchen",
    ],
    images: [
      "https://images.unsplash.com/photo-1560184897-52acbc2bcbbf?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1574375927843-0d088e52c62f?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Heritage Apartment on Derybasivska",
    description:
      "Step back in time in this stunning apartment inside a 19th-century mansion on Odesa's most famous pedestrian street. Antique furniture, high ceilings and ornate moulding — combined with modern Wi-Fi and air conditioning.",
    type: PropertyType.APARTMENT,
    city: "Odesa",
    address: "Derybasivska St 16",
    pricePerNight: 80,
    maxGuests: 2,
    amenities: [
      "Wi-Fi",
      "Air Conditioning",
      "Historic Building",
      "City Centre",
    ],
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Beach House with Private Pool",
    description:
      "A luxurious private beach house with an infinity pool overlooking the sea. Four bedrooms, a fully equipped BBQ terrace and direct beach access via a private staircase. Ideal for groups or family holidays.",
    type: PropertyType.HOUSE,
    city: "Odesa",
    address: "Fontanska Rd 40, Fontanka",
    pricePerNight: 280,
    maxGuests: 10,
    amenities: [
      "Wi-Fi",
      "Pool",
      "BBQ",
      "Parking",
      "Beachfront",
      "Air Conditioning",
      "Smart TV",
    ],
    images: [
      "https://images.unsplash.com/photo-1612722432474-b971cdcea546?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1449247613801-f6d4b7a43176?auto=format&fit=crop&w=800",
    ],
  },

  // ── Berlin ────────────────────────────────────────────────────────────────
  {
    title: "Minimalist Studio in Mitte",
    description:
      "A sleek, minimalist studio in the very centre of Berlin, ideal for business travellers. Fast fibre internet, a stand-up desk, and a curated art collection. Five minutes on foot to Museum Island.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    address: "Rosenthaler Str 25, Mitte",
    pricePerNight: 110,
    maxGuests: 2,
    amenities: ["Wi-Fi", "Standing Desk", "Air Conditioning", "City Centre"],
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd3?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Kreuzberg Loft with Courtyard",
    description:
      "A spacious loft in Berlin's most creative district. Industrial-chic aesthetics — steel beams, polished concrete floors, floor-to-ceiling bookshelves. Private access to a shared courtyard garden.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    address: "Oranienstr 58, Kreuzberg",
    pricePerNight: 135,
    maxGuests: 4,
    amenities: ["Wi-Fi", "Kitchen", "Courtyard", "Washing Machine", "Books"],
    images: [
      "https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Classic Berlin Altbau near Prenzlauer Berg",
    description:
      "A traditional Berlin Altbau (pre-war building) with beautiful stucco ceilings and herringbone parquet. Three rooms, a large eat-in kitchen and a balcony overlooking a tree-lined street.",
    type: PropertyType.APARTMENT,
    city: "Berlin",
    address: "Kastanienallee 12, Prenzlauer Berg",
    pricePerNight: 100,
    maxGuests: 5,
    amenities: [
      "Wi-Fi",
      "Kitchen",
      "Balcony",
      "Washing Machine",
      "Bike Rental Nearby",
    ],
    images: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1555854877-bab93439e74d?auto=format&fit=crop&w=800",
    ],
  },

  // ── Paris ─────────────────────────────────────────────────────────────────
  {
    title: "Charming Studio near the Eiffel Tower",
    description:
      "Ooh la la! A romantic studio for two in the 7th arrondissement, a short walk from the Eiffel Tower. French antique furniture, a Nespresso machine and a tiny balcony with iron railings — quintessentially Parisian.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    address: "Rue de Grenelle 42, 7ème",
    pricePerNight: 160,
    maxGuests: 2,
    amenities: [
      "Wi-Fi",
      "Coffee Machine",
      "Balcony",
      "Air Conditioning",
      "City Centre",
    ],
    images: [
      "https://images.unsplash.com/photo-1560185007-5f0a3b7a6ac7?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1615873968403-89583c888e04?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Haussmann Apartment in Le Marais",
    description:
      "A classic Haussmann building apartment in the heart of Le Marais — Paris's most fashionable neighbourhood. Two bedrooms, parquet floors, exposed stone walls and high ceilings. Steps from Place des Vosges.",
    type: PropertyType.APARTMENT,
    city: "Paris",
    address: "Rue de Bretagne 18, Le Marais, 3ème",
    pricePerNight: 210,
    maxGuests: 4,
    amenities: [
      "Wi-Fi",
      "Kitchen",
      "Air Conditioning",
      "Dishwasher",
      "Historic Building",
    ],
    images: [
      "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800",
    ],
  },

  // ── Rome ──────────────────────────────────────────────────────────────────
  {
    title: "Trastevere Apartment with Rooftop",
    description:
      "Lose yourself in Rome's most charming neighbourhood. This bright apartment features original terracotta tiles, arched doorways and a shared rooftop terrace with views of the basilicas. Fall asleep to the sound of fountains beneath your window.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    address: "Via della Lungara 15, Trastevere",
    pricePerNight: 130,
    maxGuests: 3,
    amenities: [
      "Wi-Fi",
      "Rooftop Terrace",
      "Kitchen",
      "Air Conditioning",
      "City Centre",
    ],
    images: [
      "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1568605117036-5f326c888be4?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Historic Flat near the Colosseum",
    description:
      "Wake up with a view of the Colosseum from this beautifully restored 2-bedroom apartment. Original Roman stone arches in the living area, a full kitchen and a quiet rear-facing terrace for evening aperitivo.",
    type: PropertyType.APARTMENT,
    city: "Rome",
    address: "Via Sacra 8, Centro Storico",
    pricePerNight: 175,
    maxGuests: 4,
    amenities: [
      "Wi-Fi",
      "Terrace",
      "Kitchen",
      "Historic Building",
      "Air Conditioning",
    ],
    images: [
      "https://images.unsplash.com/photo-1612722432474-b971cdcea546?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1574375927843-0d088e52c62f?auto=format&fit=crop&w=800",
    ],
  },

  // ── Amsterdam ─────────────────────────────────────────────────────────────
  {
    title: "Canal House Apartment, Jordaan",
    description:
      "Live like a local in a narrow Dutch canal house in the Jordaan — Amsterdam's most picturesque neighbourhood. Original wooden beams, a steep canal-house staircase and a private terrace overlooking the Prinsengracht canal.",
    type: PropertyType.APARTMENT,
    city: "Amsterdam",
    address: "Prinsengracht 204, Jordaan",
    pricePerNight: 195,
    maxGuests: 2,
    amenities: ["Wi-Fi", "Terrace", "Canal View", "Kitchen", "Bike Included"],
    images: [
      "https://images.unsplash.com/photo-1560184897-52acbc2bcbbf?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800",
    ],
  },
  {
    title: "Modern Houseboat on the IJ",
    description:
      "An innovative stay — a fully renovated houseboat moored on the IJ river with stunning views of Amsterdam's skyline. Two bedrooms, a sun deck and a kayak available for guests. Unique, unforgettable, quintessentially Amsterdam.",
    type: PropertyType.HOUSE,
    city: "Amsterdam",
    address: "NDSM Wharf, Amsterdam Noord",
    pricePerNight: 220,
    maxGuests: 4,
    amenities: [
      "Wi-Fi",
      "Sun Deck",
      "Kayak",
      "Kitchen",
      "River View",
      "Parking",
    ],
    images: [
      "https://images.unsplash.com/photo-1464082354059-d9b74de0e530?auto=format&fit=crop&w=800",
      "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=800",
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🌱 Starting seed...");

  // Create test users
  const createdUsers: Record<string, { id: string }> = {};
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
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
    console.log(`  ✅ User: ${user.email} (${user.role})`);
  }

  // Get IDs for our two owners
  const owner1Id = createdUsers["owner@demo.com"]!.id;
  const owner2Id = createdUsers["owner2@demo.com"]!.id;

  // Create properties
  let created = 0;
  for (const [index, template] of propertyTemplates.entries()) {
    // Alternate properties between owner1 and owner2
    const assignedOwnerId = index % 2 === 0 ? owner1Id : owner2Id;

    await prisma.property.create({
      data: {
        ...template,
        pricePerNight: template.pricePerNight,
        ownerId: assignedOwnerId,
        isActive: true,
      },
    });
    created++;
    console.log(
      `  🏠 ${template.title} — ${template.city} ($${template.pricePerNight}/night)`,
    );
  }

  console.log(
    `\n✅ Seed complete: ${users.length} users, ${created} properties`,
  );
  console.log("\nTest credentials:");
  for (const user of users) {
    console.log(`  ${user.role.padEnd(5)} ${user.email}  /  ${user.password}`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
