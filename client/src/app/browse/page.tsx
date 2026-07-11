import type { Metadata } from "next";
import { headers } from "next/headers";
import { BrowseView } from "@/components/property/browse-view";

export const metadata: Metadata = {
  title: "Browse stays",
  description: "Search unique places to stay by city, dates, price, and amenities.",
};

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

/**
 * Reading `headers()` opts this subtree into dynamic rendering. Isolating it
 * here (rather than in `BrowsePage` itself) keeps the static `metadata`
 * export above unaffected — Next resolves metadata independently of how the
 * page body renders.
 */
async function DetectedBrowseView() {
  const hdrs = await headers();
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

  return <BrowseView detected={{ country, city }} />;
}

export default function BrowsePage() {
  return <DetectedBrowseView />;
}
