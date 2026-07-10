import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookingSchema } from "../../modules/bookings/booking.validators.js";

function toIso(date: Date): string {
  return date.toISOString();
}

describe("createBookingSchema", () => {
  const now = new Date("2026-04-01T12:00:00.000Z");
  const propertyId = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects check-in dated yesterday", () => {
    const checkIn = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const checkOut = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["checkIn"],
            message: "Check-in cannot be in the past",
          }),
        ]),
      );
    }
  });

  it("accepts check-in dated today (UTC midnight)", () => {
    const checkIn = new Date(now);
    checkIn.setUTCHours(0, 0, 0, 0);
    const checkOut = new Date(checkIn.getTime() + 24 * 60 * 60 * 1000);

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(true);
  });

  it("rejects check-out earlier than check-in", () => {
    const checkIn = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const checkOut = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["checkOut"],
            message: "Check-out must be after check-in",
          }),
        ]),
      );
    }
  });

  it("rejects booking longer than 90 nights", () => {
    const checkIn = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const checkOut = new Date(checkIn.getTime() + 91 * 24 * 60 * 60 * 1000);

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["checkOut"],
            message: "Maximum stay is 90 nights",
          }),
        ]),
      );
    }
  });

  it("rejects booking more than 1 year in advance", () => {
    const checkIn = new Date("2027-04-03T12:00:00.000Z");
    const checkOut = new Date("2027-04-05T12:00:00.000Z");

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["checkIn"],
            message: "Cannot book more than 1 year in advance",
          }),
        ]),
      );
    }
  });

  it("accepts a valid booking payload", () => {
    const checkIn = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const checkOut = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const result = createBookingSchema.safeParse({
      propertyId,
      checkIn: toIso(checkIn),
      checkOut: toIso(checkOut),
      guests: 2,
    });

    expect(result.success).toBe(true);
  });
});
