import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhereYoullBe } from "@/components/property/where-youll-be";
import type { PropertyDetail } from "@/lib/api/properties";

const baseProperty: PropertyDetail = {
  id: "prop-1",
  title: "Pine Ridge Cabin",
  description: "A cozy cabin in the woods.",
  type: "HOUSE",
  city: "Amsterdam",
  country: "Netherlands",
  district: null,
  address: "1240 Lakeshore Dr",
  latitude: null,
  longitude: null,
  images: [],
  pricePerNight: "200",
  maxGuests: 4,
  petsAllowed: false,
  infantsAllowed: true,
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

describe("WhereYoullBe", () => {
  it("renders nothing when the property has no coordinates", () => {
    const { container } = render(<WhereYoullBe property={baseProperty} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading, subtitle and map when coordinates are present", async () => {
    render(<WhereYoullBe property={{ ...baseProperty, latitude: 52.37, longitude: 4.9 }} />);

    expect(screen.getByText("Where you'll be")).toBeInTheDocument();
    // Subtitle ("{city}, {country}") and the locality line coincide here
    // since district is null — both legitimately render the same text.
    expect(screen.getAllByText("Amsterdam, Netherlands").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1240 Lakeshore Dr")).toBeInTheDocument();
    // The map itself is lazy-loaded client-side (dynamic, ssr: false) — its
    // loading skeleton renders synchronously either way.
    expect(document.getElementById("location")).not.toBeEmptyDOMElement();
  });
});
