import { describe, it, expect } from "vitest";
import {
  toISODate,
  nightsBetween,
  formatRange,
  toISODateTime,
  isoToLocalDate,
} from "@/lib/utils/dates";

describe("toISODate", () => {
  it("returns undefined for undefined input", () => {
    expect(toISODate(undefined)).toBeUndefined();
  });

  it("pads single-digit month/day", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("uses local calendar fields, not UTC", () => {
    // 23:30 local time is the classic case where a UTC-based formatter
    // (toISOString().slice(0, 10)) would roll over to the next/prev day.
    const date = new Date(2026, 6, 15, 23, 30);
    const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;
    expect(toISODate(date)).toBe(expected);
  });
});

describe("nightsBetween", () => {
  it("counts nights between Date args", () => {
    expect(nightsBetween(new Date(2026, 6, 1), new Date(2026, 6, 5))).toBe(4);
  });

  it("counts nights between string args", () => {
    expect(nightsBetween("2026-07-01", "2026-07-05")).toBe(4);
  });

  it("returns 0 when checkIn is missing", () => {
    expect(nightsBetween(undefined, new Date(2026, 6, 5))).toBe(0);
  });

  it("returns 0 when checkOut is missing", () => {
    expect(nightsBetween(new Date(2026, 6, 1), undefined)).toBe(0);
  });

  it("returns 0 when both are missing", () => {
    expect(nightsBetween(undefined, undefined)).toBe(0);
  });

  it("returns 0 when checkOut equals checkIn", () => {
    const d = new Date(2026, 6, 1);
    expect(nightsBetween(d, new Date(d.getTime()))).toBe(0);
  });

  it("returns 0 when checkOut is before checkIn", () => {
    expect(nightsBetween(new Date(2026, 6, 5), new Date(2026, 6, 1))).toBe(0);
  });

  it("rounds a 23-hour span up to 1 night", () => {
    const a = new Date(2026, 6, 1, 0, 0, 0);
    const b = new Date(a.getTime() + 23 * 60 * 60 * 1000);
    expect(nightsBetween(a, b)).toBe(1);
  });

  it("rounds a 25-hour span down to 1 night", () => {
    const a = new Date(2026, 6, 1, 0, 0, 0);
    const b = new Date(a.getTime() + 25 * 60 * 60 * 1000);
    expect(nightsBetween(a, b)).toBe(1);
  });
});

describe("formatRange", () => {
  it("formats a range with an en dash, month abbreviations, and checkOut's year", () => {
    expect(formatRange("2026-07-01", "2026-07-05")).toBe("Jul 1 – Jul 5, 2026");
  });
});

describe("toISODateTime", () => {
  it("converts a date-only string to a UTC midnight ISO datetime", () => {
    expect(toISODateTime("2026-07-01")).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("isoToLocalDate", () => {
  it("returns local midnight for the date part, without a UTC shift", () => {
    const d = isoToLocalDate("2026-07-01T00:00:00.000Z");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(1);
  });
});
