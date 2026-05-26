import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Application } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";

const testDoubles = vi.hoisted(() => ({
  emailQueueAdd: vi.fn().mockResolvedValue(undefined),
  imageQueueAdd: vi.fn().mockResolvedValue(undefined),
  cleanupQueueAdd: vi.fn().mockResolvedValue(undefined),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  hashKey: vi.fn((value: unknown) => JSON.stringify(value)),
  cacheClientGet: vi.fn().mockResolvedValue(null),
  cacheClientTtl: vi.fn().mockResolvedValue(-1),
  cacheClientIncr: vi.fn().mockResolvedValue(0),
  cacheClientExpire: vi.fn().mockResolvedValue(1),
  cacheClientDel: vi.fn().mockResolvedValue(1),
  cacheClientScan: vi.fn().mockResolvedValue(["0", []]),
  cacheClientSet: vi.fn().mockResolvedValue("OK"),
  cacheClientCall: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: testDoubles.emailQueueAdd },
}));

vi.mock("../../shared/queues/image.queue.js", () => ({
  imageQueue: { add: testDoubles.imageQueueAdd },
}));

vi.mock("../../shared/queues/cleanup.queue.js", () => ({
  cleanupQueue: { add: testDoubles.cleanupQueueAdd },
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheClient: {
    get: testDoubles.cacheClientGet,
    ttl: testDoubles.cacheClientTtl,
    incr: testDoubles.cacheClientIncr,
    expire: testDoubles.cacheClientExpire,
    del: testDoubles.cacheClientDel,
    scan: testDoubles.cacheClientScan,
    set: testDoubles.cacheClientSet,
    call: testDoubles.cacheClientCall,
  },
  cacheGet: testDoubles.cacheGet,
  cacheSet: testDoubles.cacheSet,
  cacheDel: testDoubles.cacheDel,
  cacheInvalidateNamespace: testDoubles.cacheInvalidateNamespace,
  cacheGetNamespaceVersion: testDoubles.cacheGetNamespaceVersion,
  hashKey: testDoubles.hashKey,
}));

type RegisteredUser = { id: string; accessToken: string };

let app: Application;
let prisma: PrismaClient;

function buildIsoRange(daysFromNow: number, nights: number) {
  const checkIn = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  checkIn.setUTCHours(14, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + nights);
  checkOut.setUTCHours(12, 0, 0, 0);
  return { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString() };
}

async function registerUser(label: string): Promise<RegisteredUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  const res = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "Str0ng!Pass_2026#",
    firstName: label,
    lastName: "Race",
  });
  expect(res.status).toBe(201);
  return { id: res.body.user.id as string, accessToken: res.body.accessToken as string };
}

describe("Booking race condition integration", () => {
  beforeAll(async () => {
    const [
      { authRouter },
      { propertyRouter },
      { bookingRouter },
      { errorHandler },
      { prisma: prismaClient },
    ] = await Promise.all([
      import("../../modules/auth/auth.routes.js"),
      import("../../modules/properties/property.routes.js"),
      import("../../modules/bookings/booking.routes.js"),
      import("../../shared/middlewares/error.handler.js"),
      import("../../shared/lib/prisma.js"),
    ]);

    prisma = prismaClient;

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/v1/auth", authRouter);
    app.use("/api/v1/properties", propertyRouter);
    app.use("/api/v1/bookings", bookingRouter);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    testDoubles.emailQueueAdd.mockClear();
    testDoubles.imageQueueAdd.mockClear();
    testDoubles.cleanupQueueAdd.mockClear();

    await prisma.reviewReport.deleteMany();
    await prisma.review.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.blockedDate.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.property.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("two concurrent overlapping bookings: exactly one wins, other is rejected", async () => {
    const host = await registerUser("host");

    const createPropertyRes = await request(app)
      .post("/api/v1/properties")
      .set("Authorization", `Bearer ${host.accessToken}`)
      .send({
        title: "Race Test Villa",
        description: "A spacious and stylish villa with fast Wi-Fi, garden and parking.",
        type: "HOUSE",
        city: "Kyiv",
        address: "Khreshchatyk street 10",
        pricePerNight: 100,
        maxGuests: 4,
        amenities: ["WIFI"],
      });

    expect(createPropertyRes.status).toBe(201);
    const propertyId = createPropertyRes.body.id as string;

    const [guestA, guestB] = await Promise.all([registerUser("guest-a"), registerUser("guest-b")]);

    const stay = buildIsoRange(10, 3);

    const [resA, resB] = await Promise.all([
      request(app)
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${guestA.accessToken}`)
        .send({ propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut, guests: 2 }),
      request(app)
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${guestB.accessToken}`)
        .send({ propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut, guests: 2 }),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);

    // One request must succeed.
    expect(statuses[0]).toBe(201);
    // Loser gets 409 (availability conflict caught in tx) or 500 (Postgres P2034 serialization failure).
    expect([409, 500]).toContain(statuses[1]);

    // DB invariant: exactly one booking exists for this property.
    const bookingCount = await prisma.booking.count({ where: { propertyId } });
    expect(bookingCount).toBe(1);
  });
});
