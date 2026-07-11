import { describe, it, expect } from "vitest";
import {
  createPropertySchema,
  propertyQuerySchema,
} from "../../modules/properties/property.validators.js";

const baseCreateInput = {
  title: "Modern Studio in Podil",
  description: "A stylish studio apartment in the heart of Podil, Kyiv.",
  type: "APARTMENT",
  city: "Kyiv",
  country: "Ukraine",
  district: "Podil",
  street: "Kontraktova Square",
  houseNumber: "4",
  pricePerNight: 55,
  maxGuests: 2,
};

describe("createPropertySchema coordinates", () => {
  it("accepts both latitude and longitude", () => {
    const result = createPropertySchema.safeParse({
      ...baseCreateInput,
      latitude: 50.4501,
      longitude: 30.5234,
    });

    expect(result.success).toBe(true);
  });

  it("accepts neither latitude nor longitude", () => {
    const result = createPropertySchema.safeParse(baseCreateInput);

    expect(result.success).toBe(true);
  });

  it("rejects latitude without longitude", () => {
    const result = createPropertySchema.safeParse({
      ...baseCreateInput,
      latitude: 50.4501,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["longitude"] })]),
      );
    }
  });

  it("rejects longitude without latitude", () => {
    const result = createPropertySchema.safeParse({
      ...baseCreateInput,
      longitude: 30.5234,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["latitude"] })]),
      );
    }
  });

  it("rejects latitude out of range", () => {
    const result = createPropertySchema.safeParse({
      ...baseCreateInput,
      latitude: 95,
      longitude: 30.5234,
    });

    expect(result.success).toBe(false);
  });

  it("rejects longitude out of range", () => {
    const result = createPropertySchema.safeParse({
      ...baseCreateInput,
      latitude: 50.4501,
      longitude: 200,
    });

    expect(result.success).toBe(false);
  });
});

describe("propertyQuerySchema bounding box", () => {
  it("accepts all four bbox params together", () => {
    const result = propertyQuerySchema.safeParse({
      minLat: "52",
      maxLat: "53",
      minLng: "4",
      maxLng: "5",
    });

    expect(result.success).toBe(true);
  });

  it("accepts no bbox params", () => {
    const result = propertyQuerySchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("rejects a partial bbox", () => {
    const result = propertyQuerySchema.safeParse({
      minLat: "52",
      maxLat: "53",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["minLng", "maxLng"]));
    }
  });

  it("rejects a single bbox field alone", () => {
    const result = propertyQuerySchema.safeParse({ minLat: "52" });

    expect(result.success).toBe(false);
  });

  it("rejects an inverted bbox", () => {
    const result = propertyQuerySchema.safeParse({
      minLat: "53",
      maxLat: "52",
      minLng: "5",
      maxLng: "4",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["minLat", "minLng"]));
    }
  });

  it("rejects out-of-range latitude", () => {
    const result = propertyQuerySchema.safeParse({
      minLat: "-95",
      maxLat: "53",
      minLng: "4",
      maxLng: "5",
    });

    expect(result.success).toBe(false);
  });

  it("rejects out-of-range longitude", () => {
    const result = propertyQuerySchema.safeParse({
      minLat: "52",
      maxLat: "53",
      minLng: "4",
      maxLng: "185",
    });

    expect(result.success).toBe(false);
  });
});
