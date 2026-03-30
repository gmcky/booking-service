import { describe, it, expect } from "vitest";
import { getBookingRole } from "../../modules/bookings/booking.helpers.js";

describe("getBookingRole", () => {
  const booking = {
    userId: "user-1",
    property: {
      ownerId: "owner-1",
    },
  };

  it("returns HOST when user is property owner", () => {
    expect(getBookingRole(booking, "owner-1", "OWNER")).toBe("HOST");
  });

  it("returns GUEST when user is booking creator", () => {
    expect(getBookingRole(booking, "user-1", "USER")).toBe("GUEST");
  });

  it("returns NONE for unrelated user", () => {
    expect(getBookingRole(booking, "stranger", "USER")).toBe("NONE");
  });

  it("prioritizes ADMIN over HOST when user is both admin and owner", () => {
    expect(getBookingRole(booking, "owner-1", "ADMIN")).toBe("ADMIN");
  });

  it("returns HOST when user is both booking creator and property owner", () => {
    const selfBooking = {
      userId: "owner-1",
      property: {
        ownerId: "owner-1",
      },
    };

    expect(getBookingRole(selfBooking, "owner-1", "USER")).toBe("HOST");
  });
});
