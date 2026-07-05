import { describe, it, expect } from "vitest";
import { extendStay, flexibleWindow } from "@/lib/utils/flexible-dates";

describe("extendStay", () => {
  const from = new Date(2026, 6, 4); // Jul 4 2026

  it("keeps check-in and sets checkout N days later", () => {
    const result = extendStay(from, 7);
    expect(result.from).toEqual(from);
    expect(result.to).toEqual(new Date(2026, 6, 11));
  });

  it("derives from the picked start, so switching magnitudes replaces the checkout", () => {
    const plusSeven = extendStay(from, 7);
    const plusFourteen = extendStay(from, 14);
    expect(plusSeven.to).toEqual(new Date(2026, 6, 11));
    expect(plusFourteen.to).toEqual(new Date(2026, 6, 18));
    expect(plusFourteen.from).toEqual(from);
  });

  it("crosses month boundaries", () => {
    const result = extendStay(new Date(2026, 6, 28), 7);
    expect(result.to).toEqual(new Date(2026, 7, 4));
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
