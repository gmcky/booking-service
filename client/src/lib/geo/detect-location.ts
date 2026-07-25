// ISO-2 → display name for at least the markets this portfolio app seeds
// data for. Unknown codes fall back to `undefined` (no country badge).
const COUNTRY_NAMES: Record<string, string> = {
  UA: "Ukraine",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  NL: "Netherlands",
  PL: "Poland",
  GB: "United Kingdom",
  US: "United States",
  ES: "Spain",
  CZ: "Czechia",
  RO: "Romania",
  HU: "Hungary",
  MD: "Moldova",
};

export interface DetectedLocation {
  country?: string;
  city?: string;
  /** Approximate coordinates of the request origin, when the edge supplies them. */
  lat?: number;
  lng?: number;
}

/** Anything header-shaped: `Headers` in a route handler, `ReadonlyHeaders` in RSC. */
interface HeaderReader {
  get(name: string): string | null;
}

function parseCoord(raw: string | null, limit: number): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

/**
 * Best-effort geo from Vercel's edge headers. Reading these opts the caller
 * into dynamic rendering, which is why the only caller is the `/api/geo`
 * route handler — pages consume it through `useDetectedLocation` and stay
 * statically prerendered.
 */
export function detectLocation(hdrs: HeaderReader): DetectedLocation {
  const countryCode = hdrs.get("x-vercel-ip-country") ?? undefined;
  const rawCity = hdrs.get("x-vercel-ip-city") ?? undefined;

  const country = countryCode ? COUNTRY_NAMES[countryCode] : undefined;
  // A malformed % sequence from a misbehaving proxy must not crash the render.
  let city: string | undefined;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      city = undefined;
    }
  }

  return {
    country,
    city,
    lat: parseCoord(hdrs.get("x-vercel-ip-latitude"), 90),
    lng: parseCoord(hdrs.get("x-vercel-ip-longitude"), 180),
  };
}
