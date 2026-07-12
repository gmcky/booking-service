import prismaClientPkg, {
  Role,
  BookingStatus,
  PaymentStatus,
  PayoutStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import {
  allHosts,
  allGuests,
  allPropertyTemplates,
  allReviews,
  hostReplies,
  demoAvatars,
} from "./seed-data/index.js";

const { PrismaClient } = prismaClientPkg;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Public demo account: intentionally shareable. Has no properties or bookings,
// so a logged-in visitor can only create their own data and cannot destroy
// seeded content used by other reviewers.
const PUBLIC_DEMO_PASSWORD = "demo1234";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY_MS);
const monthsAgo = (n: number) => new Date(now - n * 30 * DAY_MS);
const yearsAgo = (n: number) => new Date(now - n * 365 * DAY_MS);

type SeededUser = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: Role;
  bio?: string;
  avatarUrl?: string;
  createdAt: Date;
  passwordSource: { kind: "public"; value: string } | { kind: "env"; envVar: string };
};

// Distinct avatars for the 5 human demo accounts, from the reserved pool
// tails maybeAvatar() never draws for hosts/guests. demo + admin stay bare.
const baseUsers: SeededUser[] = [
  {
    email: "demo@booking.dev",
    firstName: "Demo",
    lastName: "Visitor",
    phoneNumber: "+380501110000",
    role: Role.USER,
    createdAt: monthsAgo(2),
    passwordSource: { kind: "public", value: PUBLIC_DEMO_PASSWORD },
  },
  {
    email: "owner@demo.com",
    firstName: "Alex",
    lastName: "Kovalenko",
    phoneNumber: "+380501234567",
    role: Role.USER,
    avatarUrl: demoAvatars.male[0],
    createdAt: yearsAgo(6),
    passwordSource: { kind: "env", envVar: "SEED_OWNER1_PASSWORD" },
  },
  {
    email: "owner2@demo.com",
    firstName: "Oleh",
    lastName: "Sirko",
    phoneNumber: "+380509998877",
    role: Role.USER,
    avatarUrl: demoAvatars.male[1],
    createdAt: yearsAgo(6),
    passwordSource: { kind: "env", envVar: "SEED_OWNER2_PASSWORD" },
  },
  {
    email: "admin@demo.com",
    firstName: "Maria",
    lastName: "Shevchenko",
    phoneNumber: "+380631234567",
    role: Role.ADMIN,
    createdAt: yearsAgo(5),
    passwordSource: { kind: "env", envVar: "SEED_ADMIN_PASSWORD" },
  },
  {
    email: "user@demo.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    phoneNumber: "+380671234567",
    role: Role.USER,
    avatarUrl: demoAvatars.male[2],
    createdAt: yearsAgo(3),
    passwordSource: { kind: "env", envVar: "SEED_USER1_PASSWORD" },
  },
  {
    email: "user2@demo.com",
    firstName: "Olena",
    lastName: "Melnyk",
    phoneNumber: "+380672345678",
    role: Role.USER,
    avatarUrl: demoAvatars.female[0],
    createdAt: yearsAgo(3),
    passwordSource: { kind: "env", envVar: "SEED_USER2_PASSWORD" },
  },
  {
    email: "user3@demo.com",
    firstName: "Dmytro",
    lastName: "Bondarenko",
    phoneNumber: "+380673456789",
    role: Role.USER,
    avatarUrl: demoAvatars.male[3],
    createdAt: yearsAgo(3),
    passwordSource: { kind: "env", envVar: "SEED_USER3_PASSWORD" },
  },
];

// Hosts + guests become USER accounts. All hosts share one env password, all
// guests another — the credentials printout collapses each to a single line.
const hostUsers: SeededUser[] = allHosts.map((h) => ({
  email: h.email,
  firstName: h.firstName,
  lastName: h.lastName,
  role: Role.USER,
  bio: h.bio,
  avatarUrl: h.avatarUrl,
  createdAt: yearsAgo(h.createdYearsAgo),
  passwordSource: { kind: "env", envVar: "SEED_HOSTS_PASSWORD" },
}));

const guestUsers: SeededUser[] = allGuests.map((g) => ({
  email: g.email,
  firstName: g.firstName,
  lastName: g.lastName,
  role: Role.USER,
  avatarUrl: g.avatarUrl,
  createdAt: monthsAgo(g.createdMonthsAgo),
  passwordSource: { kind: "env", envVar: "SEED_GUESTS_PASSWORD" },
}));

const users: SeededUser[] = [...baseUsers, ...hostUsers, ...guestUsers];

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
  // Reuse the fallback across every user sharing this env var (e.g. all hosts).
  const existing = generated.get(source.envVar);
  if (existing) {
    return { value: existing, origin: "generated" };
  }
  const random = crypto.randomBytes(18).toString("base64url");
  generated.set(source.envVar, random);
  return { value: random, origin: "generated" };
}

function getStayDates(checkIn: Date, nights: number) {
  const ci = new Date(checkIn);
  ci.setHours(14, 0, 0, 0);
  const co = new Date(ci.getTime() + nights * DAY_MS);
  co.setHours(12, 0, 0, 0);
  return { checkIn: ci, checkOut: co, nights };
}

// Keep seed deterministic: stable snapshots across reruns/CI.
faker.seed(20260406);

async function main() {
  console.log("🌱 Starting seed...");

  const createdUsers: Record<string, { id: string; createdAt: Date }> = {};
  const generatedPasswords = new Map<string, string>();
  const baseEmails = new Set(baseUsers.map((u) => u.email));
  const resolvedCreds: Array<{
    email: string;
    role: Role;
    password: string;
    origin: "public" | "env" | "generated";
  }> = [];
  const sharedEnvOrigins = new Map<string, "env" | "generated">();

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
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
    createdUsers[user.email] = { id: created.id, createdAt: user.createdAt };

    if (baseEmails.has(user.email)) {
      resolvedCreds.push({
        email: user.email,
        role: user.role,
        password: resolved.value,
        origin: resolved.origin,
      });
    } else if (user.passwordSource.kind === "env") {
      sharedEnvOrigins.set(
        user.passwordSource.envVar,
        resolved.origin === "generated" ? "generated" : "env",
      );
    }
  }
  console.log(`  ✅ ${users.length} users upserted (${baseUsers.length} base, ${hostUsers.length} hosts, ${guestUsers.length} guests)`);

  const createdProperties: Array<{
    id: string;
    title: string;
    pricePerNight: number;
    maxGuests: number;
    ownerId: string;
    ownerEmail: string;
    city: string;
    createdAt: Date;
  }> = [];

  for (const template of allPropertyTemplates) {
    const owner = createdUsers[template.ownerEmail];
    if (!owner) {
      throw new Error(`Owner not found for property "${template.title}": ${template.ownerEmail}`);
    }
    // Listing must not predate its owner's account.
    const minCreated = owner.createdAt.getTime() + DAY_MS;
    const propCreatedAt = new Date(
      Math.max(monthsAgo(template.createdMonthsAgo).getTime(), minCreated),
    );

    const createdProperty = await prisma.property.create({
      data: {
        title: template.title,
        description: template.description,
        type: template.type,
        city: template.city,
        country: template.country,
        district: template.district,
        street: template.street,
        houseNumber: template.houseNumber,
        apartment: template.apartment,
        latitude: template.latitude,
        longitude: template.longitude,
        pricePerNight: template.pricePerNight,
        maxGuests: template.maxGuests,
        petsAllowed: template.petsAllowed ?? false,
        infantsAllowed: template.infantsAllowed ?? true,
        amenities: template.amenities,
        images: template.images,
        ownerId: owner.id,
        isActive: true,
        createdAt: propCreatedAt,
      },
      select: { id: true, title: true, pricePerNight: true, maxGuests: true, city: true },
    });

    createdProperties.push({
      id: createdProperty.id,
      title: createdProperty.title,
      pricePerNight: Number(createdProperty.pricePerNight),
      maxGuests: createdProperty.maxGuests,
      ownerId: owner.id,
      ownerEmail: template.ownerEmail,
      city: createdProperty.city,
      createdAt: propCreatedAt,
    });
  }
  const cityCount = new Set(createdProperties.map((p) => p.city)).size;
  console.log(`  🏠 ${createdProperties.length} properties across ${cityCount} cities`);

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

  // Occupied [start,end] ms ranges per property — shared so bulk bookings never
  // overlap a scenario (or each other) on the same property.
  const occupied = new Map<string, Array<[number, number]>>();
  const overlaps = (id: string, s: number, e: number) =>
    (occupied.get(id) ?? []).some(([os, oe]) => s < oe && os < e);
  const markOccupied = (id: string, s: number, e: number) => {
    const list = occupied.get(id) ?? [];
    list.push([s, e]);
    occupied.set(id, list);
  };

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
    const stay = getStayDates(new Date(now + scenario.checkInOffsetDays * DAY_MS), scenario.nights);
    markOccupied(property.id, stay.checkIn.getTime(), stay.checkOut.getTime());

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
    // Past-dated scenarios must not be "booked" after their own check-in.
    if (scenario.checkInOffsetDays < 0) {
      bookingCreateData.createdAt = new Date(stay.checkIn.getTime() - 3 * DAY_MS);
    }
    if (scenario.paymentStatus) {
      const paymentMetadata: Record<string, unknown> = { seededScenario: scenario.code };
      if (scenario.paymentStatus === "REFUND_REQUESTED") {
        paymentMetadata.refundRequest = {
          requestedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
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
      select: { id: true, status: true, payment: { select: { id: true, status: true } } },
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
  }
  console.log(`  📅 ${createdBookings} scenario bookings`);

  // ---- Bulk deterministic bookings (guests only book; never demo, never a host) ----
  const guestPool = guestUsers.map((g) => {
    const rec = createdUsers[g.email]!;
    return { id: rec.id, createdAt: rec.createdAt };
  });

  type BulkRec = {
    id: string;
    propertyId: string;
    userId: string;
    ownerId: string;
    propertyTitle: string;
    checkOut: Date;
    status: BookingStatus;
  };
  const bulkBookings: BulkRec[] = [];
  let bulkTxn = 0;

  function placeStay(propId: string, earliestMs: number, latestMs: number, nights: number) {
    const spanDays = Math.floor((latestMs - earliestMs) / DAY_MS) - nights;
    if (spanDays <= 0) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const start = earliestMs + faker.number.int({ min: 0, max: spanDays }) * DAY_MS;
      const stay = getStayDates(new Date(start), nights);
      if (!overlaps(propId, stay.checkIn.getTime(), stay.checkOut.getTime())) return stay;
    }
    return null;
  }

  async function createBulk(
    prop: (typeof createdProperties)[number],
    stay: { checkIn: Date; checkOut: Date; nights: number },
    status: BookingStatus,
    guestRec: { id: string; createdAt: Date },
  ) {
    bulkTxn++;
    const guests = faker.number.int({ min: 1, max: prop.maxGuests });
    const totalPrice = prop.pricePerNight * stay.nights;
    const floor = Math.max(guestRec.createdAt.getTime(), prop.createdAt.getTime()) + DAY_MS;
    let createdAtMs = stay.checkIn.getTime() - faker.number.int({ min: 5, max: 45 }) * DAY_MS;
    if (createdAtMs < floor) createdAtMs = floor;
    // Callers constrain the stay window per guest, so floor < checkIn holds;
    // this cap just keeps "booked" strictly before "checked in".
    createdAtMs = Math.min(createdAtMs, stay.checkIn.getTime() - 12 * 60 * 60 * 1000);
    const paymentStatus: PaymentStatus = status === "CANCELLED" ? "REFUNDED" : "SUCCESS";
    const payoutStatus: PayoutStatus =
      status === "COMPLETED"
        ? stay.checkOut.getTime() < now - 30 * DAY_MS
          ? "PAID_OUT"
          : "READY"
        : status === "CONFIRMED"
          ? "PENDING"
          : "CANCELLED";
    const data: any = {
      propertyId: prop.id,
      userId: guestRec.id,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      totalPrice,
      guests,
      status,
      payoutStatus,
      createdAt: new Date(createdAtMs),
      payment: {
        create: {
          amount: totalPrice,
          currency: "USD",
          status: paymentStatus,
          provider: "STRIPE",
          transactionId: `seed_pi_bulk_${bulkTxn}`,
        },
      },
    };
    if (status === "COMPLETED") data.actualCheckOutAt = stay.checkOut;
    const b = await prisma.booking.create({ data, select: { id: true } });
    markOccupied(prop.id, stay.checkIn.getTime(), stay.checkOut.getTime());
    bulkBookings.push({
      id: b.id,
      propertyId: prop.id,
      userId: guestRec.id,
      ownerId: prop.ownerId,
      propertyTitle: prop.title,
      checkOut: stay.checkOut,
      status,
    });
  }

  for (const [propIndex, prop] of createdProperties.entries()) {
    // Stays can't start before the listing existed (or 18 months back, whichever
    // is later) — and, per booking, not before its guest's account either.
    const propEarliestMs = Math.max(prop.createdAt.getTime() + DAY_MS, now - 18 * 30 * DAY_MS);

    const completedCount = faker.helpers.arrayElement([1, 1, 2, 2, 3]);
    for (let i = 0; i < completedCount; i++) {
      const nights = faker.number.int({ min: 2, max: 9 });
      const guest = faker.helpers.arrayElement(guestPool);
      const earliestMs = Math.max(propEarliestMs, guest.createdAt.getTime() + 2 * DAY_MS);
      const stay = placeStay(prop.id, earliestMs, now - DAY_MS, nights);
      if (!stay) continue;
      await createBulk(prop, stay, "COMPLETED", guest);
    }

    if (faker.number.float() < 0.4) {
      const nights = faker.number.int({ min: 2, max: 7 });
      const stay = placeStay(prop.id, now + 5 * DAY_MS, now + 60 * DAY_MS + nights * DAY_MS, nights);
      if (stay) {
        await createBulk(prop, stay, "CONFIRMED", faker.helpers.arrayElement(guestPool));
      }
    }

    // Every ~10th property gets a cancelled stay (past or near future).
    if (propIndex % 10 === 3) {
      const nights = faker.number.int({ min: 2, max: 5 });
      const guest = faker.helpers.arrayElement(guestPool);
      const earliestMs = Math.max(propEarliestMs, guest.createdAt.getTime() + 2 * DAY_MS, now - 90 * DAY_MS);
      const stay = placeStay(prop.id, earliestMs, now + 30 * DAY_MS, nights);
      if (stay) {
        await createBulk(prop, stay, "CANCELLED", guest);
      }
    }
  }
  const bulkByStatus = bulkBookings.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `  📅 ${bulkBookings.length} bulk bookings (${Object.entries(bulkByStatus)
      .map(([s, n]) => `${n} ${s}`)
      .join(", ")})`,
  );

  // ---- Reviews: unique hand-authored texts, one per booking, bucket-matched ----
  const reviewRatingPool = [5, 5, 5, 4, 4, 4, 3, 3] as const;
  const buckets: Record<5 | 4 | 3, string[]> = { 5: [], 4: [], 3: [] };
  for (const r of faker.helpers.shuffle([...allReviews])) buckets[r.bucket].push(r.text);
  // Falls back to the nearest non-empty bucket; caller stores the text's own
  // bucket as the rating so text and stars never disagree.
  function takeReview(wanted: 5 | 4 | 3): { text: string; rating: number } | null {
    const order: Array<5 | 4 | 3> =
      wanted === 5 ? [5, 4, 3] : wanted === 4 ? [4, 5, 3] : [3, 4, 5];
    for (const b of order) {
      const text = buckets[b].pop();
      if (text) return { text, rating: b };
    }
    return null;
  }

  const scenarioCompleted = seededScenarioRefs.find(
    (r) => r.code === "MANUAL_COMPLETED_SUCCESS_REVIEW",
  );
  const reviewCandidates: BulkRec[] = bulkBookings.filter((b) => b.status === "COMPLETED");

  let seededReviews = 0;
  let seededReplies = 0;
  const touchedPropertyIds = new Set<string>();

  async function writeReview(booking: {
    id: string;
    userId: string;
    propertyId: string;
    ownerId: string;
    checkOut: Date;
  }) {
    const wanted = faker.helpers.arrayElement(reviewRatingPool);
    const picked = takeReview(wanted);
    if (!picked) return;
    const reviewCreatedAt = new Date(
      Math.min(now, booking.checkOut.getTime() + faker.number.int({ min: 1, max: 3 }) * DAY_MS),
    );
    const withReply = faker.number.float() < 0.25;
    const reply = withReply ? faker.helpers.arrayElement(hostReplies) : null;

    await prisma.review.create({
      data: {
        bookingId: booking.id,
        userId: booking.userId,
        propertyId: booking.propertyId,
        rating: picked.rating,
        comment: picked.text,
        createdAt: reviewCreatedAt,
        ...(reply
          ? {
              hostReplyText: reply.text,
              hostReplyById: booking.ownerId,
              hostReplyCreatedAt: new Date(
                Math.min(
                  now,
                  reviewCreatedAt.getTime() + faker.number.int({ min: 1, max: 2 }) * DAY_MS,
                ),
              ),
            }
          : {}),
      },
    });
    if (reply) seededReplies++;
    touchedPropertyIds.add(booking.propertyId);
    seededReviews++;
  }

  // Scenario checkpoint booking is always reviewed (as in the old seed).
  if (scenarioCompleted) {
    const scenarioBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: scenarioCompleted.bookingId },
      select: {
        id: true,
        userId: true,
        propertyId: true,
        checkOut: true,
        property: { select: { ownerId: true } },
      },
    });
    await writeReview({ ...scenarioBooking, ownerId: scenarioBooking.property.ownerId });
  }

  for (const booking of reviewCandidates) {
    if (faker.number.float() >= 0.65) continue;
    await writeReview(booking);
  }
  console.log(`  ⭐ ${seededReviews} reviews (${seededReplies} with host reply)`);

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

  // ---- Blocked dates: every 5th property, one future range ----
  const blockReasons = ["Personal use", "Maintenance", "Family visit"];
  let blockedRanges = 0;
  for (const [propIndex, prop] of createdProperties.entries()) {
    if (propIndex % 5 !== 0) continue;
    // Blocked range must not sit on top of an existing (confirmed) booking.
    let startMs = 0;
    let endMs = 0;
    let placed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      startMs = now + faker.number.int({ min: 10, max: 50 }) * DAY_MS;
      endMs = startMs + faker.number.int({ min: 3, max: 10 }) * DAY_MS;
      if (!overlaps(prop.id, startMs, endMs)) {
        placed = true;
        break;
      }
    }
    if (!placed) continue;
    markOccupied(prop.id, startMs, endMs);
    await prisma.blockedDate.create({
      data: {
        propertyId: prop.id,
        startDate: new Date(startMs),
        endDate: new Date(endMs),
        reason: blockReasons[propIndex / 5 % blockReasons.length | 0],
      },
    });
    blockedRanges++;
  }

  console.log(
    `\n✅ Seed complete: ${users.length} users (${hostUsers.length} hosts, ${guestUsers.length} guests), ` +
      `${createdProperties.length} properties in ${cityCount} cities, ` +
      `${createdBookings + bulkBookings.length} bookings, ${seededReviews} reviews, ${blockedRanges} blocked ranges`,
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
  for (const [envVar, count] of [
    ["SEED_HOSTS_PASSWORD", hostUsers.length],
    ["SEED_GUESTS_PASSWORD", guestUsers.length],
  ] as const) {
    const origin = sharedEnvOrigins.get(envVar);
    const value = origin === "env" ? "<from env>" : generatedPasswords.get(envVar);
    console.log(`  ${String(count).padStart(2)} × shared ${envVar}  /  ${value}`);
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
