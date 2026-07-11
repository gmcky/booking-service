import type { MapBounds } from "@/components/map/base-map";

/** Padding around the viewport for marker fetches, as a span fraction. */
const MARKER_PAD_RATIO = 1;
/** Quantization step for the padded bbox, as a span fraction. */
const MARKER_GRID_RATIO = 0.5;

/**
 * Bbox used for marker fetches: padded a full viewport-span beyond the
 * visible area, then snapped outward to a half-span grid. Pans up to about
 * half a viewport usually stay inside the same padded cell and produce the
 * identical query key, so the marker set comes from the client cache — only
 * the paginated list (exact bbox) refetches. The over-fetch is bounded by
 * the server's 500-marker cap. Zoom changes the span, hence the grid,
 * hence the key: markers correctly refetch on zoom.
 */
export function paddedMarkerBounds(bounds: MapBounds): MapBounds {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  if (latSpan <= 0 || lngSpan <= 0) return bounds;

  const latStep = latSpan * MARKER_GRID_RATIO;
  const lngStep = lngSpan * MARKER_GRID_RATIO;
  const down = (v: number, step: number) => Math.floor(v / step) * step;
  const up = (v: number, step: number) => Math.ceil(v / step) * step;
  const round = (v: number) => Number(v.toFixed(4));

  return {
    minLat: round(Math.max(-90, down(bounds.minLat - latSpan * MARKER_PAD_RATIO, latStep))),
    maxLat: round(Math.min(90, up(bounds.maxLat + latSpan * MARKER_PAD_RATIO, latStep))),
    minLng: round(Math.max(-180, down(bounds.minLng - lngSpan * MARKER_PAD_RATIO, lngStep))),
    maxLng: round(Math.min(180, up(bounds.maxLng + lngSpan * MARKER_PAD_RATIO, lngStep))),
  };
}

/** Fraction of the viewport span a pan must exceed to count as a move. */
const MIN_SHIFT_RATIO = 0.1;

/**
 * True when `next` is so close to `prev` that re-searching is noise: the
 * center moved less than 10% of the viewport span and the zoom (span)
 * changed less than 10%. Micro-drags and inertia wobble land here — they
 * would produce a new bbox (hence two fresh API requests) while showing
 * the user the exact same result set.
 */
export function isMinorMove(prev: MapBounds, next: MapBounds): boolean {
  const latSpan = prev.maxLat - prev.minLat;
  const lngSpan = prev.maxLng - prev.minLng;
  if (latSpan <= 0 || lngSpan <= 0) return false;

  const centerShiftLat = Math.abs(
    (next.minLat + next.maxLat) / 2 - (prev.minLat + prev.maxLat) / 2,
  );
  const centerShiftLng = Math.abs(
    (next.minLng + next.maxLng) / 2 - (prev.minLng + prev.maxLng) / 2,
  );
  const spanChangeLat = Math.abs(next.maxLat - next.minLat - latSpan) / latSpan;
  const spanChangeLng = Math.abs(next.maxLng - next.minLng - lngSpan) / lngSpan;

  return (
    centerShiftLat < latSpan * MIN_SHIFT_RATIO &&
    centerShiftLng < lngSpan * MIN_SHIFT_RATIO &&
    spanChangeLat < MIN_SHIFT_RATIO &&
    spanChangeLng < MIN_SHIFT_RATIO
  );
}
