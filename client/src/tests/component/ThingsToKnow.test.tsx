import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThingsToKnow } from "@/components/property/things-to-know";
import type { PropertyDetail } from "@/lib/api/properties";

const baseProperty: PropertyDetail = {
  id: "prop-1",
  title: "Pine Ridge Cabin",
  description: "A cozy cabin in the woods.",
  type: "HOUSE",
  city: "Amsterdam",
  country: "Netherlands",
  district: null,
  street: "Lakeshore Dr",
  houseNumber: "1240",
  apartment: null,
  latitude: null,
  longitude: null,
  images: [],
  pricePerNight: "200",
  maxGuests: 4,
  petsAllowed: true,
  infantsAllowed: true,
  checkInTime: "15:00",
  checkOutTime: "11:00",
  amenities: [],
  averageRating: null,
  reviewCount: 0,
  ownerId: "owner-1",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  owner: { id: "owner-1", firstName: "Sam", lastName: "Host", avatarUrl: null },
  reviews: [],
};

describe("ThingsToKnow", () => {
  it("renders house rules, honest safety rows and generic cancellation wording", () => {
    render(<ThingsToKnow property={{ ...baseProperty, amenities: ["SMOKE_ALARM"] }} />);

    expect(screen.getByText("Things to know")).toBeInTheDocument();
    expect(screen.getByText("Check-in after 15:00")).toBeInTheDocument();
    expect(screen.getByText("Checkout before 11:00")).toBeInTheDocument();
    expect(screen.getByText("4 guests maximum")).toBeInTheDocument();
    expect(screen.getByText("Pets allowed")).toBeInTheDocument();
    expect(screen.getByText("Suitable for infants (under 2)")).toBeInTheDocument();

    // Safety rows derive from real amenities — positive only when present,
    // honest-negative otherwise, never fabricated.
    expect(screen.getByText("Smoke alarm")).toBeInTheDocument();
    expect(screen.getByText("No carbon monoxide alarm")).toBeInTheDocument();

    expect(
      screen.getByText("Free cancellation until 48 hours before check-in"),
    ).toBeInTheDocument();
    expect(screen.getByText("50% refund until 24 hours before check-in")).toBeInTheDocument();
  });

  it("omits check-in/checkout rows when times are null and shows negative house rules", () => {
    render(
      <ThingsToKnow
        property={{
          ...baseProperty,
          checkInTime: null,
          checkOutTime: null,
          petsAllowed: false,
          infantsAllowed: false,
        }}
      />,
    );

    expect(screen.queryByText(/Check-in after/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkout before/)).not.toBeInTheDocument();
    expect(screen.getByText("No pets")).toBeInTheDocument();
    expect(screen.getByText("Not suitable for infants")).toBeInTheDocument();
    expect(screen.getByText("No smoke alarm")).toBeInTheDocument();
  });

  it("shows concrete refund cutoffs derived from the selected check-in date", () => {
    // 2026-08-10 12:00 UTC check-in.
    const checkIn = new Date("2026-08-10T12:00:00.000Z");
    render(<ThingsToKnow property={baseProperty} checkIn={checkIn} />);

    expect(
      screen.getByText(`Free cancellation before ${formatExpected(checkIn, 48)}`),
    ).toBeInTheDocument();
    expect(screen.getByText(`50% refund before ${formatExpected(checkIn, 24)}`)).toBeInTheDocument();
    expect(
      screen.getByText("After that, the reservation is non-refundable"),
    ).toBeInTheDocument();
  });
});

function formatExpected(checkIn: Date, hoursBefore: number): string {
  const cutoff = new Date(checkIn.getTime() - hoursBefore * 60 * 60 * 1000);
  return cutoff.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
