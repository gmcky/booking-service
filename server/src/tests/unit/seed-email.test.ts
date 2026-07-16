import { describe, expect, it } from "vitest";
import { isSeedEmail } from "../../shared/utils/seed-email.js";

describe("isSeedEmail", () => {
  it.each([
    "owner@demo.com",
    "user@test.com",
    "demo@booking.dev",
    "host1@seedhost.dev",
    "guest1@seedguest.dev",
    "jane@example.com",
    "jane@example.org",
    "jane@example.co.uk",
  ])("matches %s", (email) => {
    expect(isSeedEmail(email)).toBe(true);
  });

  it.each(["OWNER@DEMO.COM", "Host1@SeedHost.Dev", "Jane@EXAMPLE.ORG"])(
    "is case-insensitive for %s",
    (email) => {
      expect(isSeedEmail(email)).toBe(true);
    },
  );

  it.each([
    "real.user@gmail.com",
    "jane@notexample.com",
    "jane@myexample.com",
    "someone@booking.devious.com",
    "no-at-sign",
    "",
  ])("does not match %s", (email) => {
    expect(isSeedEmail(email)).toBe(false);
  });
});
