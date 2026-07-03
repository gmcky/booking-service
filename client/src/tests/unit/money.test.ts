import { describe, it, expect } from "vitest";
import { parseDecimal, formatPrice, formatRating } from "@/lib/utils/money";

describe("parseDecimal", () => {
  it("parses a decimal string to a number", () => {
    expect(parseDecimal("120.50")).toBe(120.5);
  });
});

describe("formatPrice", () => {
  it("renders whole number strings without cents", () => {
    expect(formatPrice("120")).toBe("$120");
  });

  it("renders whole number values without cents, with thousands separators", () => {
    expect(formatPrice(1500)).toBe("$1,500");
  });

  it("renders fractional strings with 2 decimals", () => {
    expect(formatPrice("120.5")).toBe("$120.50");
  });
});

describe("formatRating", () => {
  it("returns null for null input", () => {
    expect(formatRating(null)).toBeNull();
  });

  it("formats a string rating to 2 decimals", () => {
    expect(formatRating("4.5")).toBe("4.50");
  });

  it("formats a whole number rating to 2 decimals", () => {
    expect(formatRating(5)).toBe("5.00");
  });
});
