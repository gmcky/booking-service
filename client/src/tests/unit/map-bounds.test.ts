import { describe, it, expect } from "vitest";
import { isMinorMove, paddedMarkerBounds } from "@/lib/utils/map-bounds";

const base = { minLat: 50.0, maxLat: 50.4, minLng: 30.0, maxLng: 30.6 };

function shifted(dLat: number, dLng: number) {
  return {
    minLat: base.minLat + dLat,
    maxLat: base.maxLat + dLat,
    minLng: base.minLng + dLng,
    maxLng: base.maxLng + dLng,
  };
}

describe("isMinorMove", () => {
  it("treats a sub-10%-of-viewport drag as minor", () => {
    // lat span 0.4 → 10% = 0.04; shift well below it
    expect(isMinorMove(base, shifted(0.01, 0.02))).toBe(true);
  });

  it("treats a real pan as a move", () => {
    expect(isMinorMove(base, shifted(0.2, 0))).toBe(false);
    expect(isMinorMove(base, shifted(0, 0.3))).toBe(false);
  });

  it("treats a zoom change as a move even with the same center", () => {
    const zoomedIn = { minLat: 50.1, maxLat: 50.3, minLng: 30.15, maxLng: 30.45 };
    expect(isMinorMove(base, zoomedIn)).toBe(false);
  });

  it("identical bounds are minor", () => {
    expect(isMinorMove(base, { ...base })).toBe(true);
  });

  it("degenerate previous bounds never suppress a move", () => {
    const degenerate = { minLat: 50, maxLat: 50, minLng: 30, maxLng: 30 };
    expect(isMinorMove(degenerate, base)).toBe(false);
  });
});

describe("paddedMarkerBounds", () => {
  it("expands beyond the viewport", () => {
    const padded = paddedMarkerBounds(base);
    expect(padded.minLat).toBeLessThan(base.minLat);
    expect(padded.maxLat).toBeGreaterThan(base.maxLat);
    expect(padded.minLng).toBeLessThan(base.minLng);
    expect(padded.maxLng).toBeGreaterThan(base.maxLng);
  });

  it("is stable under small pans within one grid cell (same query key)", () => {
    // A pan can land on a grid boundary and legitimately flip one edge —
    // stability is per-cell, so a small in-cell shift must not change keys.
    // Off-grid fixture: `base` itself sits exactly on a boundary where
    // float jitter flips the floor.
    const offGrid = { minLat: 50.03, maxLat: 50.43, minLng: 30.07, maxLng: 30.67 };
    const a = paddedMarkerBounds(offGrid);
    const b = paddedMarkerBounds({
      minLat: offGrid.minLat + 0.01,
      maxLat: offGrid.maxLat + 0.01,
      minLng: offGrid.minLng + 0.015,
      maxLng: offGrid.maxLng + 0.015,
    });
    expect(b).toEqual(a);
  });

  it("changes for a large pan", () => {
    expect(paddedMarkerBounds(shifted(0.5, 0.8))).not.toEqual(paddedMarkerBounds(base));
  });

  it("changes when the zoom (span) changes", () => {
    const zoomedIn = { minLat: 50.1, maxLat: 50.3, minLng: 30.15, maxLng: 30.45 };
    expect(paddedMarkerBounds(zoomedIn)).not.toEqual(paddedMarkerBounds(base));
  });

  it("clamps to the API's domain at world zoom", () => {
    const world = { minLat: -85, maxLat: 85, minLng: -179, maxLng: 179 };
    const padded = paddedMarkerBounds(world);
    expect(padded.minLat).toBeGreaterThanOrEqual(-90);
    expect(padded.maxLat).toBeLessThanOrEqual(90);
    expect(padded.minLng).toBeGreaterThanOrEqual(-180);
    expect(padded.maxLng).toBeLessThanOrEqual(180);
  });
});
