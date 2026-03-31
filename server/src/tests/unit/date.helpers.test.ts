import { describe, expect, it } from "vitest";
import { calculateNights } from "../../shared/utils/date.helpers.js";

describe("calculateNights", () => {
  it("returns 3 nights for exactly 3 days", () => {
    const checkIn = new Date("2026-03-01T00:00:00.000Z");
    const checkOut = new Date("2026-03-04T00:00:00.000Z");

    expect(calculateNights(checkIn, checkOut)).toBe(3);
  });

  it("returns 1 night for 23-hour difference due to Math.ceil", () => {
    const checkIn = new Date("2026-03-01T00:00:00.000Z");
    const checkOut = new Date(checkIn.getTime() + 23 * 60 * 60 * 1000);

    expect(calculateNights(checkIn, checkOut)).toBe(1);
  });

  it("returns 2 nights for 24 hours and 1 minute", () => {
    const checkIn = new Date("2026-03-01T00:00:00.000Z");
    const checkOut = new Date(
      checkIn.getTime() + 24 * 60 * 60 * 1000 + 60 * 1000,
    );

    expect(calculateNights(checkIn, checkOut)).toBe(2);
  });
});
