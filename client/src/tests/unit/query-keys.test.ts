import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query/keys";

/**
 * TanStack Query v5 invalidates by prefix match: `invalidateQueries({ queryKey:
 * someList })` invalidates every cached key that starts with `someList`. Every
 * finer-grained key under a resource must therefore start with that resource's
 * `all` key, or invalidation silently misses it.
 */
function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((value, i) => key[i] === value);
}

describe("queryKeys.bookings", () => {
  it("all is the bookings root key", () => {
    expect(queryKeys.bookings.all).toEqual(["bookings"]);
  });

  it("detail starts with the bookings root key", () => {
    expect(startsWith(queryKeys.bookings.detail("x"), queryKeys.bookings.all)).toBe(true);
  });

  it("host starts with the bookings root key", () => {
    expect(startsWith(queryKeys.bookings.host({}), queryKeys.bookings.all)).toBe(true);
  });

  it("blockedDates starts with the bookings root key", () => {
    expect(startsWith(queryKeys.bookings.blockedDates("p1"), queryKeys.bookings.all)).toBe(true);
  });

  it("detail embeds the booking id", () => {
    expect(queryKeys.bookings.detail("abc123")).toEqual(["bookings", "detail", "abc123"]);
  });

  it("host embeds the query object by identity", () => {
    const query = { status: "confirmed" };
    expect(queryKeys.bookings.host(query)[2]).toBe(query);
  });

  it("blockedDates embeds the property id", () => {
    expect(queryKeys.bookings.blockedDates("p1")).toEqual(["bookings", "blocked-dates", "p1"]);
  });
});

describe("queryKeys.properties", () => {
  it("all is the properties root key", () => {
    expect(queryKeys.properties.all).toEqual(["properties"]);
  });

  it("list starts with the properties root key", () => {
    expect(startsWith(queryKeys.properties.list({}), queryKeys.properties.all)).toBe(true);
  });

  it("browse starts with the properties root key", () => {
    expect(startsWith(queryKeys.properties.browse({}), queryKeys.properties.all)).toBe(true);
  });

  it("detail starts with the properties root key", () => {
    expect(startsWith(queryKeys.properties.detail("p1"), queryKeys.properties.all)).toBe(true);
  });

  it("mine starts with the properties root key", () => {
    expect(startsWith(queryKeys.properties.mine, queryKeys.properties.all)).toBe(true);
  });

  it("list embeds the query object by identity", () => {
    const query = { city: "Kyiv" };
    expect(queryKeys.properties.list(query)[2]).toBe(query);
  });

  it("browse embeds the query object by identity", () => {
    const query = { city: "Lviv" };
    expect(queryKeys.properties.browse(query)[2]).toBe(query);
  });

  it("detail embeds the property id", () => {
    expect(queryKeys.properties.detail("p1")).toEqual(["properties", "detail", "p1"]);
  });
});
