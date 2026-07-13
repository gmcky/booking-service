import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

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
}

/**
 * Best-effort geo from Vercel's edge headers. Reading these opts the caller
 * into dynamic rendering, so keep it in an isolated server subtree.
 */
export function detectLocation(hdrs: ReadonlyHeaders): DetectedLocation {
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

  return { country, city };
}
