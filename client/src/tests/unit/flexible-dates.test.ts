import { describe, it, expect } from "vitest";
import { extendRange, flexibleWindow } from "@/lib/utils/flexible-dates";

describe("extendRange", () => {
  const today = new Date(2026, 6, 1); // Jul 1 2026
  const base = { from: new Date(2026, 6, 10), to: new Date(2026, 6, 15) };

  it("extends from and to by the same number of days", () => {
    const result = extendRange(base, 2, today);
    expect(result.from).toEqual(new Date(2026, 6, 8));
    expect(result.to).toEqual(new Date(2026, 6, 17));
  });

  it("clamps from at today instead of going before it", () => {
    const result = extendRange(base, 14, today);
    expect(result.from).toEqual(today);
    expect(result.to).toEqual(new Date(2026, 6, 29));
  });

  it("always derives from the base, so switching magnitudes never compounds", () => {
    const plusOne = extendRange(base, 1, today);
    const plusTwo = extendRange(base, 2, today);
    expect(plusOne.from).toEqual(new Date(2026, 6, 9));
    expect(plusTwo.from).toEqual(new Date(2026, 6, 8));
    expect(plusTwo.to).toEqual(new Date(2026, 6, 17));
  });

  it("returns the base unchanged when it has no from/to", () => {
    const incomplete = { from: undefined, to: undefined };
    expect(extendRange(incomplete, 3, today)).toBe(incomplete);
  });
});

describe("flexibleWindow", () => {
  // Jul 2026: 1st is a Wednesday, first Friday is Jul 3, first Monday is Jul 6.
  const today = new Date(2026, 6, 1);
  const month = new Date(2026, 6, 1);

  it("weekend maps to the first Friday through Sunday", () => {
    const { checkIn, checkOut } = flexibleWindow(month, "weekend", today);
    expect(checkIn).toEqual(new Date(2026, 6, 3));
    expect(checkOut).toEqual(new Date(2026, 6, 5));
  });

  it("week maps to the first Monday plus 7 days", () => {
    const { checkIn, checkOut } = flexibleWindow(month, "week", today);
    expect(checkIn).toEqual(new Date(2026, 6, 6));
    expect(checkOut).toEqual(new Date(2026, 6, 13));
  });

  it("month maps to the 1st through the 1st of the next month", () => {
    const { checkIn, checkOut } = flexibleWindow(month, "month", today);
    expect(checkIn).toEqual(new Date(2026, 6, 1));
    expect(checkOut).toEqual(new Date(2026, 7, 1));
  });

  it("shifts weekend start forward when the current month's first Friday already passed", () => {
    const laterToday = new Date(2026, 6, 10); // Fri Jul 10
    const { checkIn, checkOut } = flexibleWindow(month, "weekend", laterToday);
    expect(checkIn).toEqual(new Date(2026, 6, 10));
    expect(checkOut).toEqual(new Date(2026, 6, 12));
  });

  it("shifts week start forward when the current month's first Monday already passed", () => {
    const laterToday = new Date(2026, 6, 10); // Fri Jul 10
    const { checkIn, checkOut } = flexibleWindow(month, "week", laterToday);
    expect(checkIn).toEqual(new Date(2026, 6, 13));
    expect(checkOut).toEqual(new Date(2026, 6, 20));
  });

  it("starts a month stay tomorrow when the current month's 1st already passed", () => {
    const laterToday = new Date(2026, 6, 10); // Fri Jul 10
    const { checkIn, checkOut } = flexibleWindow(month, "month", laterToday);
    expect(checkIn).toEqual(new Date(2026, 6, 11)); // today + 1, weekday irrelevant
    expect(checkOut).toEqual(new Date(2026, 7, 11));
  });

  it("does not shift when the chosen month is not the current month", () => {
    const laterMonth = new Date(2026, 7, 1); // August
    const laterToday = new Date(2026, 6, 20); // still July
    const { checkIn, checkOut } = flexibleWindow(laterMonth, "weekend", laterToday);
    expect(checkIn).toEqual(new Date(2026, 7, 7)); // first Friday of August
    expect(checkOut).toEqual(new Date(2026, 7, 9));
  });
});
