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
  emailQueue: {
    add: testDoubles.emailQueueAdd,
  },
}));

vi.mock("../../shared/queues/image.queue.js", () => ({
  imageQueue: {
    add: testDoubles.imageQueueAdd,
  },
}));

vi.mock("../../shared/queues/cleanup.queue.js", () => ({
  cleanupQueue: {
    add: testDoubles.cleanupQueueAdd,
  },
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

import { emailQueue } from "../../shared/queues/email.queue.js";

type RegisteredUser = {
  id: string;
  accessToken: string;
};

let app: Application;
let prisma: PrismaClient;

function buildIsoRange(daysFromNow: number, nights: number) {
  const checkIn = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  checkIn.setUTCHours(14, 0, 0, 0);

  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + nights);
  checkOut.setUTCHours(12, 0, 0, 0);

  return {
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
  };
}

async function waitForAsyncSideEffects(assertion: () => void) {
  const attempts = 40;
  const delayMs = 25;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function registerUser(label: string): Promise<RegisteredUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;

  const response = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "Str0ng!Pass_2026#",
    firstName: label,
    lastName: "Flow",
  });

  expect(response.status).toBe(201);
  expect(response.body.user.role).toBe("USER");

  return {
    id: response.body.user.id as string,
    accessToken: response.body.accessToken as string,
  };
}

describe("ABAC booking flow integration", () => {
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

  it("full flow: USER creates property, guest books it, host self-book is blocked, notifications are queued", async () => {
    const host = await registerUser("host");

    const createPropertyResponse = await request(app)
      .post("/api/v1/properties")
      .set("Authorization", `Bearer ${host.accessToken}`)
      .send({
        title: "Awesome Villa in Kyiv",
        description: "A spacious and stylish villa with fast Wi-Fi, garden and parking.",
        type: "HOUSE",
        city: "Kyiv",
        country: "Ukraine",
        street: "Khreshchatyk street",
        houseNumber: "10",
        pricePerNight: 120,
        maxGuests: 4,
        amenities: ["WIFI", "PARKING"],
      });

    expect(createPropertyResponse.status).toBe(201);
    const propertyId = createPropertyResponse.body.id as string;
    expect(createPropertyResponse.body.ownerId).toBe(host.id);

    expect(emailQueue.add).toHaveBeenCalledWith(
      "property-created-host",
      expect.objectContaining({ propertyId }),
    );

    const guest = await registerUser("guest");
    const stay = buildIsoRange(7, 4);

    const createBookingResponse = await request(app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${guest.accessToken}`)
      .send({
        propertyId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guests: 2,
      });

    expect(createBookingResponse.status).toBe(201);
    const bookingId = createBookingResponse.body.id as string;

    await waitForAsyncSideEffects(() => {
      // Guest gets no booking-created mail (only "Payment successful" after pay).
      expect(emailQueue.add).toHaveBeenCalledWith(
        "booking-created-host",
        expect.objectContaining({ bookingId }),
      );
    });

    const selfStay = buildIsoRange(20, 3);

    const selfBookingResponse = await request(app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${host.accessToken}`)
      .send({
        propertyId,
        checkIn: selfStay.checkIn,
        checkOut: selfStay.checkOut,
        guests: 1,
      });

    expect(selfBookingResponse.status).toBe(400);
    expect(selfBookingResponse.body).toMatchObject({
      error: "Cannot book your own property",
    });
  });
});
